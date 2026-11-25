# Draw a diagram in the docs' style

Scripts in `diagrams/` draw the diagrams, so you can change one without starting over. Older diagrams, like `docs/permissions/images/database-routing-diagram.png`, have no script.

## Check that the page needs a diagram

Check the page against "Save diagrams for flows with three or more parts" in [the skill](./SKILL.md). The text must make sense without the diagram, so fix unclear text before you draw anything.

## Back every label with a sentence on the page

Labels are product facts, so the rules for facts in [the skill](./SKILL.md) apply. Before you draw, list each tile and each connector with the sentence that backs it. If no sentence does, fix the page or cut the label. Use the page's own words and example domains.

## Start from the closest script

| Script                        | Draws                                                                        |
| ----------------------------- | ---------------------------------------------------------------------------- |
| `data-app-flow.ts`            | A main row with a side loop and a branch, and a second PNG with the same row |
| `data-app-separate-domain.ts` | A route that works and a route that's blocked                                |

To change a diagram, edit its script. For a new diagram, copy the closest script, and name the copy after its PNG. Then run the script:

```sh
bun .claude/skills/docs-write/diagrams/data-app-flow.ts
```

The script writes each PNG to its `out` path in `docs/`, writes a preview at about the width of a docs page, and prints both paths. To leave the PNG in `docs/` alone while you try things, add a folder:

```sh
bun .claude/skills/docs-write/diagrams/data-app-flow.ts /tmp/docs-diagrams
```

The script needs Chrome, and a network connection for the Roboto Mono font. If you can't run the script, leave the diagram out and say so in your reply.

## Give each style one meaning

- **Blue (`main`)**: The route that the page explains.
- **Gray (`quiet`)**: Something that always happens, but off the main route.
- **Dashed gray (`dashed`)**: A route that's optional or blocked. Put a red X (`blocked`) on a blocked route.
- **White tile with the logo (`metabase`)**: A Metabase that's running. A page in Metabase, or an app, gets its own icon.

If no icon fits, add one to `ICONS` in `lib.ts`, with 1.5px lines like the others.

## Lay the tiles out in rows

- **Rows**: Put the main route in one row, left to right. Put side routes in a row above. Leave at least 150px between rows, or 170px below a tile with three sublabels.
- **Connectors**: A tile's label is below it, so connect to its `left`, `right`, or `top`. Keep connectors from crossing.
- **Connector labels (`chip`)**: Say what happens on the line, in four words or so: "READS AND WRITES DATA." Number the labels only if the order matters.
- **Sublabels**: Write three at most, each a short fragment.
- **Capitals**: All the text in a diagram is uppercase, so leave out anything that people type, like paths, settings, and commands. Domains are fine.

## Look at both images

The script reports labels that overlap, run off the canvas, or cover their connector, and connectors that run through a label or a tile. Fix each problem until the script exits without an error. Then read the PNG and the preview yourself. The script can't see whether connectors cross, or whether the diagram says what the page says. You must be able to read every label in the preview.

## Put the PNG after the paragraph that explains it

Keep the PNG in the `images/` folder next to the page. The skill says what to put in the alt text.
