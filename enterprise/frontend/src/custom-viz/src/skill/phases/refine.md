# Refine — pin down the idea

Goal: turn the user's request into a one-line build statement. A short
dialog, not an interrogation.

Ask **1–3 questions**, and only where different answers produce a
different viz:

- the chart type, if genuinely ambiguous
- the data shape — column count, column types, expected row count. If a
  Metabase MCP server is connected, offer to read the shape from a saved
  question (ask for the question ID or URL) instead of a verbal
  description; this is the preferred path
- whether clicks should do something special, if the request hints at it

Do **not** ask about drills, hover tooltips, or dark-theme support — they
are on by default (see README). Do not ask for plan approval: the user's
request was the approval. When the answers are in, state one line —
"Building: <what>, data shape <shape>, settings <list>" — and proceed to
`phases/build.md`.

Settings: propose the obviously useful ones (a color, a threshold, a
toggle) yourself; ask only about additions that change scope. The widget
catalog lives in the settings `.d.ts` (README's source-of-truth list).

The project name was fixed at `init` time. If the user wants a different
name, follow the rename procedure in `README.md` before building.
