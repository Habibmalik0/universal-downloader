const express = require('express');
const cors = require('cors');
const { exec, spawn } = require('child_process');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

/**
 * Extract Metadata Endpoint
 */
app.post('/api/extract', (req, res) => {
    let { url } = req.body;

    if (!url) {
        return res.status(400).json({ success: false, error: 'Target URL is required.' });
    }

    if (url.includes('youtube.com') || url.includes('youtu.be')) {
        url = url.split('&list=')[0];
    }

    // Client chain fallback bypasses PO-Token requirements reliably
    const command = `yt-dlp -j --no-warnings --cookies ./cookies.txt "${url}"`;

    exec(command, { maxBuffer: 1024 * 1024 * 20 }, (error, stdout, stderr) => {
        if (error) {
            console.error('Extraction Error Details:', stderr || error.message);
            return res.status(500).json({ 
                success: false, 
                error: 'Failed to extract media. YouTube flagged the connection or URL is invalid.' 
            });
        }

        try {
            const data = JSON.parse(stdout);
            const rawFormats = data.formats || [];
            const processedLinks = [];

            // Process all playable video streams (including DASH/HLS streams)
            rawFormats.forEach(fmt => {
                if (fmt.vcodec !== 'none' && (fmt.ext === 'mp4' || fmt.ext === 'm4a' || fmt.ext === 'webm')) {
                    processedLinks.push({
                        format_id: fmt.format_id,
                        quality: fmt.format_note || `${fmt.height || 'SD'}p`,
                        ext: fmt.ext || 'mp4',
                        filesize_mb: fmt.filesize ? (fmt.filesize / (1024 * 1024)).toFixed(1) : 'Unknown',
                        direct_url: fmt.url
                    });
                }
            });

            // Fallback if filtering yields empty array
            if (processedLinks.length === 0) {
                processedLinks.push({
                    format_id: 'best',
                    quality: 'Best Available',
                    ext: 'mp4',
                    filesize_mb: 'Unknown',
                    direct_url: `/api/stream?url=${encodeURIComponent(url)}`
                });
            }

            res.json({
                success: true,
                title: data.title,
                thumbnail: data.thumbnail,
                duration: data.duration,
                extractor: data.extractor_key,
                formats: processedLinks
            });
        } catch (e) {
            res.status(500).json({ success: false, error: 'Error parsing video metadata payload.' });
        }
    });
});

/**
 * Proxy Stream Download Endpoint
 */
app.get('/api/stream', (req, res) => {
    let videoUrl = req.query.url;
    const formatId = req.query.format_id || 'bestvideo+bestaudio/best';

    if (!videoUrl) {
        return res.status(400).send('URL query parameter is required.');
    }

    if (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')) {
        videoUrl = videoUrl.split('&list=')[0];
    }

    res.setHeader('Content-Disposition', 'attachment; filename="video.mp4"');
    res.setHeader('Content-Type', 'video/mp4');

    const ytdlp = spawn('yt-dlp', [
    '--cookies', './cookies.txt',
    '-f', formatId,
    '-o', '-',
    videoUrl
]);

    ytdlp.stdout.pipe(res);

    ytdlp.stderr.on('data', (data) => {
        console.error(`yt-dlp streaming log: ${data}`);
    });

    req.on('close', () => {
        ytdlp.kill('SIGINT');
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Downloader Engine actively running on port ${PORT}`);
});