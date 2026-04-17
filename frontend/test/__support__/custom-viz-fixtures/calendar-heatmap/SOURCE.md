# Calendar Heatmap fixture

Vendored build artifacts of the Calendar Heatmap custom visualization plugin,
used by the Storybook stories under
`frontend/test/__support__/custom-viz-fixtures/CalendarHeatmap.*.stories.tsx`
— dashboard, question, and document contexts, each in light and dark mode —
captured by Loki.

- **Source:** https://github.com/metabase/custom-viz-calendar-heatmap
- **Pinned commit:** `8289235680ee9226f7a1e8bee33aa694b8f9d959`

## Files

- `index.js` — UMD bundle (assigns factory to `window.__customVizPlugin__`)
- `metabase-plugin.json` — plugin manifest
- `assets/calendar.svg` — plugin icon

## Updating

From a clone of the upstream repo at the desired commit:

```bash
UPSTREAM=/path/to/custom-viz-calendar-heatmap
DEST=frontend/test/__support__/custom-viz-fixtures/calendar-heatmap
cp "$UPSTREAM/dist/index.js" "$DEST/index.js"
cp "$UPSTREAM/dist/assets/calendar.svg" "$DEST/assets/calendar.svg"
cp "$UPSTREAM/metabase-plugin.json" "$DEST/metabase-plugin.json"
```

Then bump the pinned commit above and refresh the Loki baseline:

```bash
bun run storybook            # in one shell
npx loki update --chromeFlags='--headless --disable-gpu' \
  --storiesFilter CalendarHeatmap
```
