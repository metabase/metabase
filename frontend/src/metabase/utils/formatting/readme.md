# utils/formatting

Formatting primitives: plain value in, display string out. Numbers,
currency, durations, null placeholders, and identifier-to-display-name
string munging (`singularize`, `titleize`, `formatField`, `slugify`, ...).

This directory is **lib tier** - the module-boundaries linter guarantees it
can import nothing app-ward (only other lib code, `metabase-types`, and
compiled cljs). Keep it that way: these helpers are imported from
everywhere, including `metabase-lib/v1`.

Anything that needs a **column** or speaks column-settings / temporal-unit
vocabulary does not belong here - that's
[`metabase/value-formatting`](../../value-formatting/readme.md). The
boundary is a signature test, not a topic test: `formatTime(value, unit,
TimeOnlyOptions)` lives there, `formatDurationLong(ms)` lives here.
