// Free iTunes Search API — no key required.
// Returns an Apple Music track object or null.

const ITUNES_API = 'https://itunes.apple.com/search';

export async function searchAppleMusic(artist, title) {
  const term = [artist, title].filter(Boolean).join(' ').trim();
  if (!term) return null;

  const url = `${ITUNES_API}?${new URLSearchParams({ term, media: 'music', entity: 'song', limit: 5 })}`;
  const res = await fetch(url);
  if (!res.ok) return null;

  const data = await res.json();
  if (!data.results?.length) return null;

  return bestMatch(data.results, artist, title);
}

function bestMatch(results, artist, title) {
  if (!artist) return results[0];

  const norm = s => s?.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, '') ?? '';
  const targetArtist = norm(artist);

  // Prefer results where artist name matches
  const artistMatch = results.find(r => {
    const a = norm(r.artistName);
    return a.includes(targetArtist) || targetArtist.includes(a);
  });

  return artistMatch ?? results[0];
}
