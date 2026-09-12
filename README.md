# epl-same-fixture

Static HTML-first app showing how many points a Premier League team has gained compared to the same fixtures last season.

- Data: [openfootball/football.json](https://github.com/openfootball/football.json) (CC0) — synced nightly via GitHub Actions to `public/data/`.
- Strict home/away matching by default.
- Promoted 1/2/3 (Champ) ↔ Relegated 18/19/20 (PL) positional proxy (1→18, 2→19, 3→20).
- Manual fixtures: add/edit/delete directly in browser, persisted to `localStorage` and shareable via `?m=` URL.
- Fully static, deployable to GitHub Pages.

## Data sync

`npm run sync` or the nightly `sync-data.yml` workflow fetches `en.1.json` (PL) and `en.2.json` (Champ) for 2022-23 .. 2025-26, computes tables, validates naming and regenerates `public/data/mapping.json`.

## Develop

No build step required — open `index.html` or `npx serve .`.

```
npm run sync    # fetch openfootball -> public/data
npm run dev     # serve locally
```

## URL sharing

Manual fixtures are encoded as `?m=base64url(json)` (lz-string compressed when needed) plus `&team=` and `&season=`. Priority: `?m=` > `localStorage`.

Data credit: openfootball CC0. This project only fetches, reshapes and displays it.
