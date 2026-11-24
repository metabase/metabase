# Font prototype log

Trying alternatives to Lato across the whole app. There are no Version A/B/C variants: one Leva panel switches typefaces and tunes them live.

## How it works

- Panel: `frontend/src/metabase/font-prototype/FontPrototype.tsx`, mounted in `app.tsx`. ⌥L flips back to Lato as shipped. ⌥P hides the panel.
- The chosen font is registered with the FontFace API under the family name **Lato** (and **JetBrains Mono** for the code font). Faces added from JS take precedence over the CSS `@font-face` rules, so the UI, the charts and canvas text measurement all switch. Deleting the faces restores Lato.
- Weight mapping: for each CSS weight (100–900), one face points at the variable file with `font-variation-settings: "wght" <mapped>`. This needs a browser that supports that `@font-face` descriptor (verified in Chrome 149).
- Fonts are self-hosted Fontsource packages, because the app's CSP allows fonts only from its own origin. Only latin and latin-ext are loaded. Other scripts fall back to the bundled Lato.
- Settings are stored per person in local storage, per typeface.
- Heading font: registered as its own family ("MB Prototype Headings") and applied to Mantine's `--mantine-font-family-headings` (the `Title` component) and raw `h1`–`h6`. Text styled to look like a heading (`<Text fw="bold" fz="lg">`) keeps the UI font. "Auto" pairs a text cut with its display cut (Wix Madefor Text → Wix Madefor Display, in `HEADING_PAIRS` in `fonts.ts`), and otherwise uses the UI font. The heading font uses the weights, axes and size adjust it was last tuned to as the UI font.

## Controls

| Folder | Scope | Controls |
| --- | --- | --- |
| Typeface | global | UI font, heading font, Show Lato (⌥L), code font |
| Size & spacing | per font | size-adjust %, letter spacing (em, on every element without its own), ascent, descent and line-gap overrides (off = the font's own) |
| Weights | per font | what Regular 400, Medium 500, Semibold 600, Bold 700 and Black 900 render as. 100–300 keep their distance below Regular, and 800 sits halfway between Bold and Black. |
| Axes | per font | every variable axis other than wght. Optical size is off (automatic) by default. |
| OpenType features | per font | tnum, zero, case, ss01, ss02, cv11, plus free CSS syntax |
| Type scale | global | body size and the Mantine `xs`–`xl` and `h1`–`h4` tokens. Text with hard-coded px sizes in CSS modules doesn't follow these. Size adjust scales everything. |
| Rendering | global | font smoothing |

## Known limits

- No italic faces: italics are synthesized.
- Canvas text widths that were measured and cached before a switch can be stale until reload.
- Adding a font: `bun add @fontsource-variable/<name>`, then run `prototype/generate-font-registry.mjs` (see its header).
- The build's BannerPlugin prepends the license comment to font files referenced from JS. `font-faces.ts` strips it before parsing.
