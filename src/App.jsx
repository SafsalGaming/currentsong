import { useEffect, useState } from "react";
import {
  handleCallbackIfPresent,
  isLoggedIn,
  loginWithSpotify,
  logout,
  getAccessToken,
  tokenIsExpiredSoon,
  refreshAccessToken,
} from "./spotifyAuth";
import GeniusEmbed from "./GeniusEmbed";

async function fetchCurrentlyPlaying(accessToken) {
  const res = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (res.status === 204) return null; // nothing playing
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Currently playing failed: ${res.status} ${t}`);
  }
  return await res.json();
}

export default function App() {
  const [status, setStatus] = useState("init");
  const [error, setError] = useState("");
  const [now, setNow] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        setStatus("checking_callback");
        await handleCallbackIfPresent();
        setStatus(isLoggedIn() ? "logged_in" : "logged_out");
      } catch (e) {
        setError(e?.message || String(e));
        setStatus("error");
      }
    })();
  }, []);

  useEffect(() => {
    if (status !== "logged_in") return;

    let alive = true;
    let timer = null;

    const tick = async () => {
      try {
        if (tokenIsExpiredSoon()) await refreshAccessToken();
        const token = getAccessToken();
        const data = await fetchCurrentlyPlaying(token);

        if (!alive) return;
        setNow(data);
        setError("");
      } catch (e) {
        if (!alive) return;
        setError(e?.message || String(e));
      } finally {
        if (!alive) return;
        timer = setTimeout(tick, 3000);
      }
    };

    tick();

    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [status]);

  const item = now?.item;
  const image = item?.album?.images?.[0]?.url;
  const trackName = item?.name;
  const artists = item?.artists?.map((a) => a.name).join(", ");
  const album = item?.album?.name;
  const progressMs = now?.progress_ms ?? 0;
  const durationMs = item?.duration_ms ?? 1;

  return (
    <div style={{ fontFamily: "sans-serif", padding: 16, maxWidth: 520 }}>
      <h2>Spotify Now Playing (test)</h2>

      {status === "logged_out" && (
        <button onClick={() => loginWithSpotify()}>
          Login with Spotify
        </button>
      )}

      {status === "logged_in" && (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={() => logout()}>Logout</button>
          <span style={{ opacity: 0.7 }}>Polling כל 3 שניות</span>
        </div>
      )}

      {error && (
        <pre style={{ whiteSpace: "pre-wrap", color: "crimson" }}>
          {error}
        </pre>
      )}

      <hr />

      {!now && status === "logged_in" && (
        <div>לא מנגן כרגע / אין מידע.</div>
      )}

      {item && (
        <div style={{ display: "flex", gap: 12 }}>
          {image && (
            <img
              src={image}
              alt="cover"
              width={140}
              height={140}
              style={{ borderRadius: 8, objectFit: "cover" }}
            />
          )}

          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{trackName}</div>
            <div>{artists}</div>
            <div style={{ opacity: 0.8 }}>{album}</div>

            <div style={{ marginTop: 10 }}>
              <div style={{ height: 8, background: "#ddd", borderRadius: 999 }}>
                <div
                  style={{
                    height: 8,
                    width: `${Math.min(100, (progressMs / durationMs) * 100)}%`,
                    background: "#333",
                    borderRadius: 999,
                  }}
                />
              </div>
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                {Math.floor(progressMs / 1000)}s / {Math.floor(durationMs / 1000)}s
              </div>
            </div>

            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>
              Explicit: {item.explicit ? "כן" : "לא"}<br />
              Popularity: {item.popularity}<br />
              Track ID: {item.id}
            </div>
          </div>
        </div>
      )}

      {item && (
        <GeniusEmbed
          trackName={item.name}
          artistName={item.artists?.[0]?.name}
          progressMs={progressMs}
          durationMs={durationMs}
        />
      )}
    </div>
  );
}
