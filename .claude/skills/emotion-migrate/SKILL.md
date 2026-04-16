---
name: emotion-migrate
description: Migrate Emotion styled-components to Mantine components with style props and CSS modules. Use when converting .styled.tsx files or removing @emotion imports from components.
---

# Emotion → Mantine + CSS Modules Migration Skill

Migrate Emotion styled-components (`@emotion/styled`, `@emotion/react`) to Mantine layout components with style props and CSS modules. The goal is zero Emotion imports, zero inline styles, and maximum use of design system tokens.

## Priority Order (Strict)

1. **Mantine components + style props** — `Box`, `Flex`, `Stack`, `Group`, `Text`, `Title`, `Card`. This is the DEFAULT. Every CSS property must be checked against style props FIRST.
2. **CSS modules** (`.module.css`) — ONLY for properties that Mantine style props genuinely cannot express: pseudo-selectors (`:hover`, `:focus`, `::before`), `box-shadow`, `border` shorthand, `animation`/`@keyframes`, complex selectors, `cursor`, `pointer-events`, `overflow`, `text-overflow`, `white-space`, `transition`.
3. **Inline styles ONLY for dynamic values** — `style={{ }}` is allowed only for truly dynamic runtime values (e.g., computed widths, positions, data-driven colors). All static styles must use Mantine props or CSS modules.

### Mantine-First Decision Gate (CRITICAL)

For EACH styled component, go through every CSS property and ask: "Can this be a Mantine style prop?" If yes → style prop. If no → CSS module. Do NOT dump an entire component into a CSS module just because one property needs it — split them.

**Properties that ARE style props** (use these, not CSS modules):

- `display` → `display` prop
- `color` → `c` prop (`c="brand"`, `c="text-primary"`)
- `background-color` → `bg` prop (`bg="background-primary"`)
- `font-size` → `fz` prop (`fz="md"`)
- `font-weight` → `fw` prop (`fw="bold"`)
- `line-height` → `lh` prop (`lh="md"`)
- `text-align` → `ta` prop (`ta="center"`)
- `padding` (all variants) → `p`, `px`, `py`, `pt`, `pb`, `pl`, `pr`
- `margin` (all variants) → `m`, `mx`, `my`, `mt`, `mb`, `ml`, `mr`
- `width` → `w`, `min-width` → `miw`, `max-width` → `maw`
- `height` → `h`, `min-height` → `mih`, `max-height` → `mah`
- `flex` → `flex` prop (`flex="0 0 auto"`, `flex={1}`)
- `gap` → `gap` prop (on Flex/Stack/Group)
- `align-items` → `align` prop (on Flex/Stack/Group)
- `justify-content` → `justify` prop (on Flex/Stack/Group)
- `flex-direction` → `direction` prop (on Flex)
- `flex-wrap` → `wrap` prop (on Flex)
- `position` → `pos` prop
- `top/right/bottom/left` → `top`, `right`, `bottom`, `left` props
- `opacity` → `opacity` prop

**Properties that NEED CSS modules** (no style prop equivalent):

- `:hover`, `:focus`, `:active`, `::before`, `::after` (pseudo-selectors)
- `box-shadow`, `border` (shorthand with color), `outline`
- `cursor`, `pointer-events`
- `overflow`, `text-overflow`, `white-space`
- `animation`, `transition`, `transform`
- `@media` queries (UNLESS it's simple responsive spacing/sizing — then use responsive syntax: `p={{ base: "md", lg: "xl" }}`)

**Hybrid approach** — when a component needs BOTH, put style props on the Mantine component AND add a CSS module class for the rest:

```tsx
<Flex
  className={S.root}       /* for :hover, box-shadow, border */
  align="center"            /* style prop */
  gap="sm"                  /* style prop */
  p="md"                    /* style prop */
  bg="background-primary"   /* style prop */
>
```

## CSS Module Conventions (Strict)

### Class Naming: camelCase

All CSS module class names MUST use **camelCase**. This is the dominant convention across the codebase (~830 camelCase vs ~620 PascalCase classes), used consistently in Mantine UI components, and matches standard CSS module conventions.

```css
/* CORRECT */
.root {
}
.settingsSection {
}
.dragHandle {
}
.closeIcon {
}

/* WRONG — do not use PascalCase or kebab-case */
.ItemRoot {
}
.settings-section {
}
```

Modifier/state classes also use camelCase:

```css
.selected {
}
.disabled {
}
.interactive {
}
.draggable {
}
```

### No Cascading — Direct Class Assignment

Cascading selectors are **discouraged**. Instead of styling through parent-child relationships, assign a class directly to the element that needs styling.

```css
/* WRONG — cascading/descendant selectors */
.root > input {
}
.root .label {
}
.container > div > span {
}

/* CORRECT — direct class on the target element */
.input {
}
.label {
}
.title {
}
```

The only acceptable nesting patterns are:

- **Pseudo-selectors on the same element**: `.item { &:hover { } }`
- **Modifier composition**: `.item { &.selected { } }`
- **Hover-reveal patterns** where a parent hover affects a child: `.root:hover .showOnHover { opacity: 1; }` — but only when structurally necessary (the child has no way to know about the parent's hover state)

### Import Alias

Always import the CSS module as `S`:

```tsx
import S from "./ComponentName.module.css";
```

## Step-by-Step Migration Process

### Step 1: Read and Understand

Read the `.styled.tsx` file AND every component that imports from it. Understand:

- Which styled components are used and where
- Which props drive dynamic styles
- Which styles are static vs conditional
- Which styles can map directly to Mantine style props

### Step 2: Classify Each Styled Component

For each styled component, apply the Mantine-First Decision Gate above. Then determine the migration target:

| Emotion Pattern                                              | Migration Target                                                                                                                                                           |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `styled.div` with only layout/spacing/color                  | `Box`, `Flex`, `Stack`, or `Group` with style props. **NO CSS module needed.**                                                                                             |
| `styled.div` with flexbox column                             | `Stack` component with style props                                                                                                                                         |
| `styled.div` with flexbox row                                | `Flex` or `Group` component with style props                                                                                                                               |
| `styled.span` / `styled.p` with color/weight/size            | **`Text component="span"` with style props** (`c`, `fw`, `fz`). NO CSS module.                                                                                             |
| `styled.div` with hover/focus/pseudo-selectors               | **Hybrid**: Mantine component with style props for expressible properties + CSS module class for pseudo-selectors only                                                     |
| `styled.div` with media queries (simple spacing/sizing)      | **Responsive style props**: `p={{ base: "md", lg: "xl" }}`. NO CSS module.                                                                                                 |
| `styled.div` with media queries (complex/non-spacing)        | CSS module for the media query parts, style props for the rest                                                                                                             |
| `styled.div` with animations/keyframes                       | CSS module for animation, style props for layout                                                                                                                           |
| `styled(SomeComponent)` with only color/spacing/flex         | **Wrap in Mantine component** with style props: `<Box c="brand" flex="0 0 auto"><Icon /></Box>`, or pass style props if the component accepts them                         |
| `styled(SomeComponent)` with pseudo-selectors/complex styles | CSS module `className` on the component                                                                                                                                    |
| Dynamic props `styled.div<{ isActive: boolean }>`            | Mantine style props for simple toggles (`c={active ? "brand" : "text-primary"}`), `cx()` with CSS module classes for complex state combinations involving pseudo-selectors |

### Step 3: Create CSS Module (if needed)

Create `ComponentName.module.css` alongside the component file:

```css
/* Use design system tokens — NEVER raw color/spacing values */
.root {
  border: 1px solid var(--mb-color-border);
  border-radius: var(--mantine-radius-md);
  background-color: var(--mb-color-background-primary);
}

/* Conditional states as separate classes, combined with cx() */
.active {
  background-color: var(--mb-color-brand);
  color: var(--mb-color-text-primary-inverse);
}

.disabled {
  color: var(--mb-color-text-tertiary);
  pointer-events: none;
}

/* Hover/focus/pseudo-selectors — nest with & */
.interactive {
  cursor: pointer;

  &:hover {
    color: var(--mb-color-brand);
    background-color: var(--mb-color-background-hover);
  }
}

/* Hover-reveal: acceptable parent→child nesting */
.root:hover .showOnHover {
  opacity: 1;
}

/* Responsive styles */
@media (--breakpoint-min-md) {
  .root {
    padding: var(--mantine-spacing-lg);
  }
}
```

### Step 4: Update the Component TSX

```tsx
import cx from "classnames";
import CS from "metabase/css/core/index.css";
import { Box, Flex, Group, Stack, Text } from "metabase/ui";
import S from "./ComponentName.module.css";

// Dynamic props → cx() with conditional classes
<Flex
  className={cx(S.root, {
    [S.active]: isActive,
    [S.disabled]: disabled,
  })}
  align="center"
  gap="sm"
  p="md"
  w="100%"
>
```

### Step 5: Delete the `.styled.tsx` File

Remove the old styled file entirely. Remove all imports of it from other files.

### Step 6: Verify

- Confirm zero `@emotion/styled` or `@emotion/react` imports remain in the migrated files
- Confirm no static inline styles (dynamic runtime values are fine)
- Confirm all colors use tokens, not raw hex/rgb values

## Design System Token Reference

### Mantine Style Props (use directly on components)

**Spacing** (`p`, `px`, `py`, `pt`, `pb`, `pl`, `pr`, `m`, `mx`, `my`, `mt`, `mb`, `ml`, `mr`):

- `"xs"` = 4px, `"sm"` = 8px, `"md"` = 16px, `"lg"` = 24px, `"xl"` = 32px
- Custom: `rem(48)` for non-standard values (import `rem` from `metabase/ui`)

**Dimensions** (`w`, `h`, `maw`, `mah`, `miw`, `mih`):

- `"100%"`, `"100vh"`, `rem(400)`, etc.

**Colors** (`c`, `bg`):

- Text: `"text-primary"`, `"text-secondary"`, `"text-tertiary"`
- Background: `"background-primary"`, `"background-secondary"`, `"background-hover"`
- Brand: `"brand"`, `"error"`, `"success"`, `"warning"`

**Typography** (`fz`, `fw`, `lh`, `ta`, `ff`):

- Font size: `"xs"` = 11px, `"sm"` = 12px, `"md"` = 14px, `"lg"` = 17px, `"xl"` = 21px
- Font weight: `"bold"`, `"normal"`, or numeric `700`
- Line height: `"xs"` = 100%, `"sm"` = 115%, `"md"` = 122%, `"lg"` = 138%, `"xl"` = 150%
- Text align: `"center"`, `"left"`, `"right"`

**Flexbox** (`align`, `justify`, `gap`, `direction`, `wrap`, `flex`):

- `align="center"`, `justify="space-between"`, `gap="sm"`, `direction="column"`, `wrap="nowrap"`
- `flex={1}`, `flex="0 0 auto"`

**Other**: `pos` (position), `display`

**Responsive syntax**: `px={{ base: "md", md: "lg", lg: rem(48) }}`

### CSS Variable Tokens (use in `.module.css` files)

**Colors** — `var(--mb-color-<name>)`:

- `--mb-color-text-primary`, `--mb-color-text-secondary`, `--mb-color-text-tertiary`
- `--mb-color-background-primary`, `--mb-color-background-secondary`, `--mb-color-background-hover`
- `--mb-color-border`, `--mb-color-border-strong`, `--mb-color-border-subtle`
- `--mb-color-brand`, `--mb-color-brand-hover`
- `--mb-color-error`, `--mb-color-success`, `--mb-color-warning`
- `--mb-color-shadow`, `--mb-color-focus`
- `--mb-color-accent0` through `--mb-color-accent7`

**Mantine spacing** — `var(--mantine-spacing-<size>)`:

- `--mantine-spacing-xs` (4px), `--mantine-spacing-sm` (8px), `--mantine-spacing-md` (16px), `--mantine-spacing-lg` (24px), `--mantine-spacing-xl` (32px)

**Mantine radius** — `var(--mantine-radius-<size>)`:

- `--mantine-radius-xs` (4px), `--mantine-radius-sm` (6px), `--mantine-radius-md` (8px), `--mantine-radius-xl` (40px)

**Mantine font sizes** — `var(--mantine-font-size-<size>)`:

- `--mantine-font-size-xs` (11px), `--mantine-font-size-sm` (12px), `--mantine-font-size-md` (14px), `--mantine-font-size-lg` (17px), `--mantine-font-size-xl` (21px)

**Breakpoints** (in `.module.css` files):

- `@media (--breakpoint-min-sm)` (40em / 640px)
- `@media (--breakpoint-min-md)` (60em / 960px)
- `@media (--breakpoint-min-lg)` (80em / 1280px)
- `@media (--breakpoint-min-xl)` (120em / 1920px)
- Also available: `--breakpoint-max-*` variants

### Snap Hardcoded Literals to Nearest Design Token (CRITICAL)

When migrating, **never carry over hardcoded `rem`/`px` values** from the original Emotion code. Instead, snap them to the nearest design system token. The original values were often arbitrary — the migration is an opportunity to align with the design system.

**Spacing** — snap to the nearest Mantine spacing token:

| Hardcoded value                   | Nearest token | Style prop   | CSS variable                   |
| --------------------------------- | ------------- | ------------ | ------------------------------ |
| `0.125rem` (2px)                  | `2px`         | `2` (number) | `2px` (keep literal, no token) |
| `0.2rem` (3.2px), `0.25rem` (4px) | **xs** (4px)  | `"xs"`       | `var(--mantine-spacing-xs)`    |
| `0.5rem` (8px)                    | **sm** (8px)  | `"sm"`       | `var(--mantine-spacing-sm)`    |
| `0.75rem` (12px)                  | between sm/md | `rem(12)`    | `0.75rem` (no exact token)     |
| `1rem` (16px)                     | **md** (16px) | `"md"`       | `var(--mantine-spacing-md)`    |
| `1.5rem` (24px)                   | **lg** (24px) | `"lg"`       | `var(--mantine-spacing-lg)`    |
| `2rem` (32px)                     | **xl** (32px) | `"xl"`       | `var(--mantine-spacing-xl)`    |

**Border radius** — snap to the nearest Mantine radius token:

| Hardcoded value  | Nearest token                 | CSS variable               |
| ---------------- | ----------------------------- | -------------------------- |
| `0.25rem` (4px)  | **xs** (4px)                  | `var(--mantine-radius-xs)` |
| `0.375rem` (6px) | **sm** (6px)                  | `var(--mantine-radius-sm)` |
| `0.5rem` (8px)   | **md** (8px)                  | `var(--mantine-radius-md)` |
| `1rem`+ (16px+)  | **xl** (40px) or keep literal | `var(--mantine-radius-xl)` |

**Font sizes** — snap to the nearest Mantine font size token:

| Hardcoded value                  | Nearest token | Style prop | CSS variable                  |
| -------------------------------- | ------------- | ---------- | ----------------------------- |
| `0.6875rem` (11px)               | **xs** (11px) | `fz="xs"`  | `var(--mantine-font-size-xs)` |
| `0.75rem` (12px)                 | **sm** (12px) | `fz="sm"`  | `var(--mantine-font-size-sm)` |
| `0.875rem` (14px), `1rem` (16px) | **md** (14px) | `fz="md"`  | `var(--mantine-font-size-md)` |
| `1.063rem` (17px)                | **lg** (17px) | `fz="lg"`  | `var(--mantine-font-size-lg)` |
| `1.3rem` (21px)                  | **xl** (21px) | `fz="xl"`  | `var(--mantine-font-size-xl)` |

**Rules:**

- If the hardcoded value is within ~2px of a token, use the token
- If it falls exactly between two tokens, prefer the smaller one (tighter is safer)
- If no token is close (e.g., `48px` spacing), use `rem(48)` for style props or the literal value in CSS modules
- This applies everywhere: style props, CSS module values, Icon `size` props, etc.

## Common Migration Patterns

### Pattern 1: Static Layout Container → Mantine Component

**Before:**

```tsx
// Component.styled.tsx
export const Container = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem;
  width: 100%;
`;
```

**After:**

```tsx
<Flex align="center" gap="sm" p="md" w="100%">
```

### Pattern 2: Vertical Stack → Stack Component

**Before:**

```tsx
export const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  padding: 2rem;
`;
```

**After:**

```tsx
<Stack gap="lg" p="xl">
```

### Pattern 3: Dynamic Props → cx() with CSS Module Classes

**Before:**

```tsx
export const Item = styled.div<{ isSelected: boolean; disabled: boolean }>`
  color: ${(props) =>
    props.disabled ? color("text-tertiary") : color("text-primary")};
  background-color: ${(props) =>
    props.isSelected ? color("brand") : "transparent"};
  cursor: ${(props) => (props.disabled ? "default" : "pointer")};

  &:hover {
    color: ${(props) => !props.disabled && color("brand")};
  }
`;
```

**After (CSS module):**

```css
/* Item.module.css */
.itemRoot {
  color: var(--mb-color-text-primary);
  cursor: pointer;

  &:hover {
    color: var(--mb-color-brand);
  }
}

.selected {
  background-color: var(--mb-color-brand);
}

.disabled {
  color: var(--mb-color-text-tertiary);
  cursor: default;

  &:hover {
    color: var(--mb-color-text-tertiary);
  }
}
```

**After (TSX):**

```tsx
<Box
  className={cx(S.itemRoot, {
    [S.selected]: isSelected,
    [S.disabled]: disabled,
  })}
>
```

### Pattern 4: Extending a Component → Style Props First, CSS Module Only If Needed

When a styled component wraps another component, first check if the styles can be expressed as style props on a Mantine wrapper or on the component itself. Only use a CSS module when properties genuinely need it.

**Before:**

```tsx
export const CardIcon = styled(Icon)`
  display: block;
  flex: 0 0 auto;
  color: var(--mb-color-brand);
`;

export const CardTitle = styled(Ellipsified)`
  color: var(--mb-color-text-primary);
  font-size: 1rem;
  font-weight: bold;
  margin-left: 1rem;
`;
```

**After — style props on Mantine wrapper (preferred when ALL properties are expressible):**

```tsx
<Box display="block" flex="0 0 auto" c="brand">
  <Icon {...icon} />
</Box>
<Box c="text-primary" fz="md" fw="bold" ml="md">
  <Ellipsified>{title}</Ellipsified>
</Box>
```

**After — CSS module (use only when component has pseudo-selectors or non-expressible styles):**

```css
.icon {
  color: var(--mb-color-brand);
  width: 1.5rem;
  height: 1.5rem;
  cursor: pointer;

  &:hover {
    color: var(--mb-color-brand-hover);
  }
}
```

```tsx
<Icon className={S.icon} name="warning" />
```

### Pattern 4b: `styled.span` / `styled.p` with Text Styles → `Text` Component

**Before:**

```tsx
export const Label = styled.span`
  color: var(--mb-color-text-secondary);
  font-weight: bold;
`;

export const Title = styled.span`
  color: var(--mb-color-text-primary);
  font-size: 1rem;
  font-weight: bold;
  margin-left: 0.5rem;
`;
```

**After — `Text` component with style props (NO CSS module needed):**

```tsx
<Text component="span" c="text-secondary" fw="bold">
  {label}
</Text>

<Text component="span" c="text-primary" fz="md" fw="bold" ml="sm">
  {title}
</Text>
```

`Text` renders as `<p>` by default. Use `component="span"` to render inline. All color, typography, and spacing props work directly — no CSS module needed for pure text styling.

### Pattern 5: Keyframes Animation → CSS Module

**Before:**

```tsx
const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

export const Spinner = styled.div`
  animation: ${spin} 1s infinite linear;
`;
```

**After (CSS module):**

```css
@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.spinner {
  animation: spin 1s infinite linear;
}
```

**After (TSX):**

```tsx
<Box className={S.spinner} />
```

### Pattern 6: color() Function → CSS Variables

| Emotion (JS)            | CSS Module                                                   | Mantine Style Prop          |
| ----------------------- | ------------------------------------------------------------ | --------------------------- |
| `color("brand")`        | `var(--mb-color-brand)`                                      | `c="brand"` or `bg="brand"` |
| `color("text-primary")` | `var(--mb-color-text-primary)`                               | `c="text-primary"`          |
| `color("border")`       | `var(--mb-color-border)`                                     | N/A (use CSS module)        |
| `alpha("brand", 0.2)`   | `color-mix(in srgb, var(--mb-color-brand), transparent 80%)` | N/A (use CSS module)        |

### Pattern 7: Responsive Spacing/Sizing → Responsive Style Props (NOT CSS Media Queries)

When a styled component only changes spacing, sizing, or other style-prop-expressible values at breakpoints, use Mantine's responsive syntax instead of CSS module media queries.

**Before:**

```tsx
export const CaptionRoot = styled.div`
  margin-bottom: 1.5rem;

  ${breakpointMinExtraLarge} {
    margin-bottom: 2rem;
  }
`;
```

**After — responsive style prop (NO CSS module needed):**

```tsx
<Flex mb={{ base: "lg", xl: "xl" }}>
```

Breakpoint keys: `base` (default), `xs` (40em), `sm` (48em), `md` (60em), `lg` (80em), `xl` (120em).

Only use CSS module `@media` queries when the responsive change involves non-style-prop properties (e.g., `box-shadow`, `border`, `cursor` changes at breakpoints).

### Pattern 8: Dynamic Computed Styles → Inline Styles

Inline styles are allowed **only** for truly dynamic values computed at runtime (e.g., widths, positions, colors from data). Everything else must use Mantine style props or CSS modules.

**Before:**

```tsx
export const Bar = styled.div<{ width: number }>`
  width: ${(props) => props.width}%;
`;
```

**After:**

```tsx
<Box style={{ width: `${width}%` }} />
```

### Pattern 9: Core CSS Utility Classes (Discouraged)

**Do NOT introduce new `CS` utility class usage.** Core CSS utilities (`CS` from `metabase/css/core/index.css`) are legacy and discouraged for new code. Prefer Mantine style props or CSS modules instead.

If existing code already uses `CS` classes and you're not migrating that specific code, leave them alone. But when migrating Emotion → Mantine, replace with the proper alternative:

| Instead of `CS.*`   | Use                                                     |
| ------------------- | ------------------------------------------------------- |
| `CS.overflowHidden` | CSS module: `overflow: hidden`                          |
| `CS.cursorPointer`  | CSS module: `cursor: pointer`                           |
| `CS.flex1`          | Style prop: `flex={1}`                                  |
| `CS.flexNoShrink`   | Style prop: `flex="0 0 auto"`                           |
| `CS.textBrandHover` | CSS module: `&:hover { color: var(--mb-color-brand); }` |

### Pattern 10: Shared Emotion Styles Across Files → Shared CSS Module + cx()

When Emotion exports a shared `css` block (like `animationStyles`) imported by many files, create ONE CSS module with the shared keyframe and a reusable class, then compose via `cx()`.

**Before (Emotion — shared animation used by 13+ skeleton files):**

```tsx
// ChartSkeleton.styled.tsx — defines shared animation
const fadingKeyframes = keyframes`
  0% { opacity: 0.0625; }
  50% { opacity: 0.125; }
  100% { opacity: 0.0625; }
`;
export const animationStyles = css`
  opacity: 0.1;
  animation: ${fadingKeyframes} 1.5s infinite;
`;

// AreaSkeleton.styled.tsx — consumes it
import { animationStyles } from ".../ChartSkeleton.styled";
export const SkeletonImage = styled.svg`
  ${animationStyles};
  flex: 1 1 0;
  margin-top: 1rem;
  border-bottom: 1px solid currentColor;
`;

// BarSkeleton.styled.tsx — also consumes it
import { animationStyles } from ".../ChartSkeleton.styled";
export const SkeletonImage = styled.svg`
  ${animationStyles};
  flex: 1 1 0;
  margin-top: 1rem;
`;
```

**After — shared CSS module:**

```css
/* ChartSkeleton.module.css */
@keyframes fading {
  0% {
    opacity: 0.0625;
  }

  50% {
    opacity: 0.125;
  }

  100% {
    opacity: 0.0625;
  }
}

.animated {
  opacity: 0.1;
  animation: fading 1.5s infinite;
}
```

**After — per-component CSS modules with own styles only:**

```css
/* AreaSkeleton.module.css */
.skeletonImage {
  flex: 1 1 0;
  margin-top: 1rem;
  border-bottom: 1px solid currentColor;
}
```

```css
/* BarSkeleton.module.css */
.skeletonImage {
  flex: 1 1 0;
  margin-top: 1rem;
}
```

**After — component TSX uses cx() to compose:**

```tsx
// AreaSkeleton.tsx
import cx from "classnames";
import ChartSkeletonS from "../ChartSkeleton/ChartSkeleton.module.css";
import S from "./AreaSkeleton.module.css";

const AreaSkeleton = (): JSX.Element => {
  return (
    <svg
      className={cx(ChartSkeletonS.animated, S.skeletonImage)}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 371 113"
      preserveAspectRatio="none"
    >
      <path d="..." fill="currentColor" />
    </svg>
  );
};
```

The shared module owns the `@keyframes` and the `.animated` class. Each consumer composes it with its own module class via `cx()`. No duplication of the keyframe definition.

## Import Template

```tsx
import cx from "classnames"; // only if needed for conditional classes

import { Box, Flex, Group, Stack, Text, rem } from "metabase/ui";

import S from "./ComponentName.module.css"; // only if CSS module is needed
```

## Checklist Before Finishing

- [ ] **MANTINE-FIRST CHECK**: Every CSS property that has a style prop equivalent (`c`, `bg`, `p`, `m`, `fw`, `fz`, `flex`, `gap`, `align`, `w`, `h`, etc.) is expressed as a style prop, NOT in a CSS module
- [ ] `styled.span`/`styled.p` with only color/weight/size are replaced with `Text component="span"` + style props, NOT CSS module classes
- [ ] `styled.div` with only layout props are replaced with `Flex`/`Stack`/`Group`/`Box` + style props, NOT CSS module classes
- [ ] Responsive spacing/sizing uses responsive style props (`mb={{ base: "lg", xl: "xl" }}`), NOT CSS module `@media` queries
- [ ] CSS modules are used ONLY for: pseudo-selectors, box-shadow, border, cursor, overflow, animation, transition, transform, or complex selectors
- [ ] All `@emotion/styled` and `@emotion/react` imports removed from migrated files
- [ ] The `.styled.tsx` file is deleted
- [ ] All imports of the deleted styled file are updated
- [ ] No static inline styles — `style={{ }}` used only for truly dynamic runtime values
- [ ] All colors use design tokens (`c="brand"`, `var(--mb-color-brand)`), not raw hex/rgb
- [ ] All spacing uses design tokens (`p="md"`, `var(--mantine-spacing-md)`), not arbitrary px values — hardcoded `rem`/`px` literals snapped to the nearest token (see mapping table above)
- [ ] All border-radius values use radius tokens (`var(--mantine-radius-md)`), not hardcoded `0.5rem`
- [ ] All font sizes use font-size tokens (`fz="md"`, `var(--mantine-font-size-md)`), not hardcoded `1rem`
- [ ] Layout uses Mantine components (`Flex`, `Stack`, `Group`, `Box`, `Text`) not raw divs/spans with CSS
- [ ] All CSS module class names use camelCase
- [ ] No cascading/descendant selectors targeting raw elements — use direct class assignment instead
- [ ] Component renders identically to the original (visually verify if possible)

## Visual Verification with Screenshots (Optional — Only When Explicitly Asked)

When the user explicitly asks to create before/after screenshots, use the Playwright MCP tools to capture them. This is NOT done by default — only when requested.

Screenshots must be taken in **both light and dark mode** to verify token usage is correct in both themes.

### Switching Color Scheme via API

Toggle between light and dark mode using the Metabase settings API. Use Playwright's `browser_evaluate` or `browser_navigate` with fetch:

```js
// Switch to dark mode
await fetch("/api/setting/color-scheme", {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ value: "dark" }),
});

// Switch to light mode
await fetch("/api/setting/color-scheme", {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ value: "light" }),
});
```

After switching, reload the page for the theme to take effect.

### Process

For each state (**after** = migrated code, **before** = stashed original), capture screenshots in both themes at both viewport widths. This produces **8 screenshots total**.

1. **Take "after" screenshots first** (migrated code is already in place):

   - Navigate to the page that renders the migrated components (`browser_navigate`)
   - Wait for content to load (`browser_wait_for` with key text, or `textGone: "Loading..."`)
   - Close the sidebar if it overlaps content on narrow viewports (`browser_click` the toggle button)
   - **Light mode** (set `color-scheme` to `"light"` via API, reload):
     - Desktop (1280x900): `after-light-desktop.png`
     - Narrow (640x900), close sidebar: `after-light-narrow.png`
   - **Dark mode** (set `color-scheme` to `"dark"` via API, reload):
     - Desktop (1280x900): `after-dark-desktop.png`
     - Narrow (640x900), close sidebar: `after-dark-narrow.png`

2. **Stash changes to capture "before" screenshots**:

   - Run `git stash --include-untracked` to temporarily revert to the Emotion version
   - Repeat the same 4 screenshots with `before-` prefix:
     - `before-light-desktop.png`, `before-light-narrow.png`
     - `before-dark-desktop.png`, `before-dark-narrow.png`
   - Run `git stash pop` to restore the migrated code

3. **Restore the user's original color scheme** (set back to `"auto"` or whatever it was before).

4. **Display all 8 screenshots** using the `Read` tool so the user can visually compare before/after in both themes at both viewport sizes.

### Key Details

- Save screenshots in the repo root (they will be untracked — user can delete after review)
- The dev server must be running (typically `http://localhost:3000`)
- Use `browser_snapshot` to find element refs when you need to click buttons (e.g., sidebar toggle)
- The greeting text on the home page changes randomly on each load — this is expected, not a regression
- If the page being tested is not the home page, navigate to the correct URL that exercises the migrated components
- Dark mode screenshots are critical for verifying that CSS variable tokens (`var(--mb-color-*)`) are used correctly — hardcoded colors will look wrong in dark mode
