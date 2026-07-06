# Capturing a real Zillow listing → `listing.json`

Zillow runs aggressive bot protection (PerimeterX "press & hold"), so generic
site downloaders get a CAPTCHA page instead of photos. Use a **real Chrome
session driven by claude-in-chrome** — it renders like a human and sails past it.

## Steps

1. **Connect Chrome** and load the browser tools:
   ```
   ToolSearch "select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__get_page_text,mcp__claude-in-chrome__javascript_tool,mcp__claude-in-chrome__computer"
   ```
2. **Open the listing** in a new tab and solve the press-and-hold once if it appears.
3. **Scrape the facts** with `get_page_text` / `read_page`:
   address · price · beds · baths (incl. half) · sqft ("Living Area") · yearBuilt ·
   the "What's special" description · the listing URL.
4. **Pull hi-res photo URLs.** Zillow hydrates a JSON blob — get the *large* sources,
   not the low-res `<img src>` thumbnails. Run via `javascript_tool`:
   ```js
   // Grab the responsivePhotos array from the embedded Next.js data.
   const el = document.querySelector('#__NEXT_DATA__');
   const data = JSON.parse(el.textContent);
   // Path varies; search for "responsivePhotos" and take the widest mixedSources.jpeg per photo.
   JSON.stringify(
     [...document.querySelectorAll('script')]
       .map(s => s.textContent).join('')
       .match(/https:\/\/photos\.zillowstatic\.com\/[^\"']+?_(1536|1344|1024)\.(webp|jpg)/g) || []
   );
   ```
5. **Download + downscale** each photo, keeping the repo small and textures GPU-friendly:
   ```bash
   curl -sL "<photo-url>" -o "assets/rooms/kitchen.jpg"
   sips -Z 1600 "assets/rooms/kitchen.jpg"    # cap the long edge at 1600px
   ```
   Save the front/exterior shot to `assets/hero.jpg`.
6. **Bucket photos → rooms** by their caption / room tag (Zillow labels many photos),
   then set each room's `photos[].url` in `listing.json`.
7. **Update facts** in `listing.json` (address, price, beds, baths, sqft, yearBuilt,
   description, `sourceUrl`, `attribution`). Reload — the house rebuilds from data.

## Optional: match the floor plan to the real home

The default `listing.json` is a plausible 3bd/2ba plan. To reshape it, edit room
`width`/`depth`/`x`/`z` (meters, NW-corner anchor, +x = east, +z = south) and the
`openings`. `loadListing.js` validates on load — the console warns on any room
overlap or unreachable room, so keep an eye on it.

## Copyright

Listing photos are © the listing agent / MLS. Keep this a **personal,
non-commercial** proof-of-concept: show the `attribution` string + link
`sourceUrl` on screen, don't rehost as original, take down on request. If you'll
publish photos on a public repo, consider keeping that repo **private** or using
only your own captures.

## Real capture → splat (the honest photoreal path)

For an actual Gaussian splat of a home you physically visit:
1. Shoot a **dense video walkthrough** (slow, overlapping, every room).
2. Extract frames — [`video-scout`](https://github.com/wilsonwu-ai/video-scout).
3. Estimate camera poses — COLMAP or glomap.
4. Train a 3DGS model — INRIA `gaussian-splatting` / `gsplat` / Nerfstudio (GPU).
5. Convert to a web format — [`splat-transform`](https://github.com/wilsonwu-ai/splat-transform)
   → `.compressed.ply` / `.ksplat`, then point `listing.splat.src` at it.
