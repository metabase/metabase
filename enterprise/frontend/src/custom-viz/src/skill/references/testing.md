# Testing

`src/index.test.tsx` holds the viz's tests; `npm test` runs them
(Vitest, `happy-dom`). They run against a mocked Metabase host that
behaves like the real one on everything below.

```tsx
import {
  checkViz,
  mockColumn,
  mockSeries,
  renderViz,
} from "@metabase/custom-viz/testing";
import { describe, expect, it } from "vitest";

import createVisualization from "./index";
```

## API

- `mockColumn(kind, name, overrides?)` — a column with the types Metabase
  sends for that kind. Kinds: `text` · `category` · `title` · `url` · `email` · `integer` · `float` · `count` · `sum` · `currency` · `percentage` · `score` · `boolean` · `date` · `datetime` · `date-breakout` · `month-breakout` · `day-of-week` · `hour-of-day` · `pk` · `fk` · `latitude` · `longitude` · `country` · `state`.
  `text` is native SQL text (no semantic type); `category`, `title`,
  `country`, `state` are query-builder text. `integer`, `float` are
  native numbers; `count`, `sum`, `score` are query-builder aggregations.
  `date-breakout`, `month-breakout` are bucketed datetimes;
  `day-of-week`, `hour-of-day` are integer date parts.
- `mockSeries(cols, rows)` — a one-result `series`.
- `checkViz(createVisualization, { series, settings? })` — resolves
  settings as Metabase does (`getValue`; else the passed value if
  `isValid` accepts it; else `getDefault`), runs `checkRenderable`;
  throws its error.
- `renderViz(createVisualization, { series, settings?, colorScheme?, width?, height? })`
  — `checkViz`, then renders the component; a render error throws.
  Returns `container`, `hovers` and `clicks` (every `onHover`/`onClick`
  argument), `hover(el)` and `leave(el)` (return the last `onHover`
  argument), `click(el)` (returns the last `onClick` argument),
  `findHoverableMarks()` and `findClickableMarks()` (elements whose hover
  or click produced an object), `unmount()`.

The mock host throws on: a column not built with `mockColumn`;
`getColor` or a rendered `var(--mb-color-…)` with a name outside
`api-contract.md` Colors; `formatValue` number options without a numeric
`column`.

## What to test

Derive every expectation from `.claude/build-statement.md`:

- Statement-shaped data renders in `light` and `dark`. A text column
  that could come from SQL or the query builder → test `text` and
  `category`; an integer metric → `integer` and `count`.
- `checkRenderable` throws for a wrong column count and a wrong column
  type, and accepts a single row and other valid edge rows.
- Hover not opted out → every hoverable mark: `hover` returns an object,
  `leave` returns `null`; at least one hoverable mark.
- Drills not opted out → at least one clickable mark; `click` returns an
  object with a `value`.
- Each statement setting → rendering with a non-default value does not
  throw.

Assert only what the statement promises; no exact text, colors or
layout unless it names them. Size, contrast and layout are the user's
live check (`operations.md`).
