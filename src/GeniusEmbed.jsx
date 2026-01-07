import { useEffect, useState, useRef } from "react";

const GENIUS_ACCESS_TOKEN = import.meta.env.VITE_GENIUS_ACCESS_TOKEN;

export default function GeniusEmbed({ trackName, artistName, progressMs, durationMs }) {
    const [embedUrl, setEmbedUrl] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const containerRef = useRef(null);
    const scrollRef = useRef(null);

    useEffect(() => {
        if (!trackName || !artistName) return;

        const fetchLyrics = async () => {
            setLoading(true);
            setError(null);
            try {
                const query = encodeURIComponent(`${trackName} ${artistName}`);
                const response = await fetch(
                    `https://api.genius.com/search?q=${query}`,
                    {
                        headers: {
                            Authorization: `Bearer ${GENIUS_ACCESS_TOKEN}`,
                        },
                    }
                );
                const data = await response.json();
                const hit = data.response.hits[0];
                if (hit) {
                    // Genius doesn't provide a direct embed URL in the search API usually.
                    // The standard way is to use the path or ID to construct a widget URL.
                    // Note: Standard Genius embeds are usually JS widgets, but they also have iframe ones.
                    // For simplicity, we can use a "song-id" based approach if available, 
                    // but often developers use a proxy or just the widget.
                    // Here we use the song ID to target the genius lyrics widget.
                    setEmbedUrl(`https://genius.com/songs/${hit.result.id}/embed.js`);

                    // However, since we want to control SCROLL, an iframe is better.
                    // Genius has an undocumented (but widely used) iframe embed:
                    // https://genius.com/songs/{id}/embed
                    setEmbedUrl(`https://genius.com/songs/${hit.result.id}/embed`);
                } else {
                    setError("Lyrics not found");
                }
            } catch (err) {
                setError("Failed to fetch lyrics");
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        fetchLyrics();
    }, [trackName, artistName]);

    useEffect(() => {
        if (!scrollRef.current || !durationMs) return;

        // Simulate scrolling by moving the scrollable container.
        // This is the "auto-scroll" matching the song progress.
        const container = scrollRef.current;
        const totalHeight = container.scrollHeight - container.clientHeight;
        const scrollPos = (progressMs / durationMs) * totalHeight;

        container.scrollTo({
            top: scrollPos,
            behavior: "smooth",
        });
    }, [progressMs, durationMs]);

    return (
        <div style={{ marginTop: 20, border: "1px solid #ddd", borderRadius: 8, overflow: "hidden" }}>
            <div style={{ padding: "8px 12px", background: "#f5f5f5", borderBottom: "1px solid #ddd", fontSize: 14, fontWeight: "bold" }}>
                Lyrics (Auto-scroll synced)
            </div>

            {loading && <div style={{ padding: 20 }}>Searching Genius...</div>}
            {error && <div style={{ padding: 20, color: "red" }}>{error}</div>}

            {embedUrl && (
                <div
                    ref={scrollRef}
                    style={{
                        height: "500px",
                        overflowY: "auto",
                        position: "relative",
                        background: "#fff"
                    }}
                >
                    {/* We use a very tall iframe to ensure we can scroll within our own container */}
                    <iframe
                        src={embedUrl}
                        title="Genius Lyrics"
                        style={{
                            width: "100%",
                            height: "3000px", // Arbitrary large height to contain most lyrics
                            border: "none",
                        }}
                        scrolling="no"
                    />
                </div>
            )}
        </div>
    );
}
