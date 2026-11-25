---
name: docs-diagram
description: Draw or change a diagram in `docs/`. Use only when the person asks for a diagram.
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Grep, Bash, Glob
---

# Draw a diagram in the docs' style

Read [the docs skill](../metabase-docs/SKILL.md) too, since its rules for facts apply to labels.

Scripts draw the diagrams, so you can change one without starting over. Older diagrams, like `docs/permissions/images/database-routing-diagram.png`, have no script.

## Check that the page needs a diagram

Draw a diagram when readers have to keep three or more parts in mind at once: who talks to what, in which order, and what's blocked. Numbered steps, a list, or a single screen don't need one. If the page doesn't need a diagram, say so before you draw.

The text must make sense without the diagram, so fix unclear text before you draw anything.

## Back every label with a sentence on the page

Labels are product facts. Before you draw, list each tile and each connector with the sentence that backs it. If no sentence does, fix the page or cut the label. Use the page's own words and example domains.

## Find the script, or copy one

Each diagram has a script next to its PNG, named `NAME.diagram.ts`. To change a diagram, find its script by the name of the PNG:

```sh
grep -rl "data-app-flow-one-metabase.png" docs --include='*.diagram.ts'
```

For a new diagram, copy the closest of these, and keep the copy next to its PNG:

- `docs/data-apps/images/data-app-flow.diagram.ts`: A main row with a side loop and a branch, and a second PNG with the same row.
- `docs/data-apps/images/data-app-separate-domain.diagram.ts`: A route that works and a route that's blocked.

Then run the script:

```sh
bun docs/data-apps/images/data-app-flow.diagram.ts
```

The script writes each PNG to its `out` path in `docs/`, writes a preview at about the width of a docs page, and prints both paths. To leave the PNG in `docs/` alone while you try things, add a folder:

```sh
bun docs/data-apps/images/data-app-flow.diagram.ts /tmp/docs-diagrams
```

The script needs Chrome, and a network connection for the Roboto Mono font. If you can't run the script, leave the diagram out and say so in your reply.

## Use these functions

They're in `bin/docs-diagram/lib.ts`. You don't need to read that file, unless you add an icon.

```ts
tile(x, y, icon, title, { sublabels, style }); // style: "main" or "quiet"
connect(points, { style, arrows }); // style: "main", "quiet", or "dashed"; arrows: "end", "start", "both", or "none"
chip(x, y, text); // a label on a connector
blocked(x, y); // a red X
render({ out, title, parts }); // out: the path of the PNG, from the root of the repo
```

- **Icons**: `terminal`, `git`, `app`, `page`, `code`, `person`, and `metabase`. If no icon fits, add one to `ICONS`, with 1.5px lines like the others.
- **Positions**: `x` and `y` are the center of a tile, chip, or X, on a canvas that's 980px wide. Tiles are 64px. Keep labels 24px from the edges.
- **Connectors**: Each segment is horizontal or vertical. To connect tiles, use `left(tile)`, `right(tile)`, and `top(tile)` as points. `CORNER_RADIUS` is the room that a branch needs to turn.

## Give each style one meaning

- **Blue (`main`)**: The route that the page explains.
- **Gray (`quiet`)**: Something that always happens, but off the main route.
- **Dashed gray (`dashed`)**: A route that's optional or blocked. Put a red X (`blocked`) on a blocked route.
- **White tile with the logo (`metabase`)**: A Metabase that's running. A page in Metabase, or an app, gets its own icon.

## Lay the tiles out in rows

- **Rows**: Put the main route in one row, left to right. Put side routes in a row above. Leave at least 150px between rows, or 170px below a tile with three sublabels.
- **Connectors**: A tile's label is below it, so connect to its `left`, `right`, or `top`. Keep connectors from crossing.
- **Connector labels (`chip`)**: Say what happens on the line, in four words or so: "READS AND WRITES DATA." Number the labels only if the order matters.
- **Sublabels**: Write three at most, each a short fragment.
- **Capitals**: All the text in a diagram is uppercase, so leave out anything that people type, like paths, settings, and commands. Domains are fine.

## Look at both images

The script reports labels that overlap, run off the canvas, or cover their connector, and connectors that run through a label or a tile. Fix each problem until the script exits without an error. Then read the PNG and the preview yourself. The script can't see whether connectors cross, or whether the diagram says what the page says. You must be able to read every label in the preview.

## Put the PNG after the paragraph that explains it

Keep the PNG in the `images/` folder next to the page. Start the alt text with "A flow diagram of," and tell the whole flow in sentences, in order, including what's blocked. `docs/data-apps/build.md` has an example.
