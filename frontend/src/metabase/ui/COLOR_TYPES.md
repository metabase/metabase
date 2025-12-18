# Mantine Color Type System

This document explains the type-safe color system for Mantine components in Metabase.

## Overview

As of this change, all Mantine color props (`c`, `color`, `bg`, `backgroundColor`, etc.) are restricted to only accept colors defined in `metabase/lib/colors.ts`.

## Implementation

The type restriction is implemented through TypeScript module augmentation in `frontend/src/types/mantine.d.ts`:

```typescript
export interface MantineThemeColorsOverride {
  colors: Record<ColorName, MantineColorsTuple>;
}
```

This interface tells TypeScript that Mantine's color system should only accept `ColorName` types, which are automatically derived from the `colorConfig` object in `metabase/lib/colors/colors.ts`.

## Usage

### Valid Color Usage ✅

```tsx
import { Text, Box } from "metabase/ui";

// These work because they use defined Metabase colors:
<Text c="brand">Brand text</Text>
<Text c="text-primary">Primary text</Text>
<Text c="error">Error text</Text>
<Box bg="background-light">Light background</Box>
```

### Invalid Color Usage ❌

```tsx
// These will produce TypeScript errors:
<Text c="invalid-color">This will error</Text>
<Text c="blue">This will error (use "saturated-blue" or brand colors instead)</Text>
<Box bg="#FF0000">This will error (use named colors instead)</Box>
```

## Available Colors

All 103+ colors defined in `colorConfig` are valid, including:

### Primary Colors
- `brand`, `brand-light`, `brand-lighter`, `brand-dark`, `brand-darker`
- `white`, `background`

### Text Colors
- `text-primary`, `text-secondary`, `text-tertiary`
- `text-medium`, `text-light`, `text-dark`
- `text-brand`, `text-hover`, `text-selected`
- `text-disabled`, `text-white`

### Background Colors
- `background`, `background-light`, `background-hover`
- `bg-primary`, `bg-secondary`, `bg-tertiary`
- `bg-light`, `bg-medium`, `bg-dark`, `bg-darker`
- `bg-white`, `bg-black`

### Semantic Colors
- `error`, `danger`, `success`, `warning`, `info`
- `filter`, `summarize`

### Border Colors
- `border`, `border-dark`, `border-primary`, `border-secondary`, `border-subtle`

### Special Colors
- `saturated-blue`, `saturated-green`, `saturated-purple`, `saturated-red`, `saturated-yellow`
- `tooltip-background`, `tooltip-text`
- `admin-navbar`, `admin-navbar-secondary`

And many more! See `metabase/lib/colors/colors.ts` for the complete list.

## Benefits

1. **Type Safety**: TypeScript will catch invalid color names at compile time
2. **Autocomplete**: IDEs will provide autocomplete suggestions for valid color names
3. **Consistency**: Ensures all components use colors from the design system
4. **Maintainability**: Changes to the color palette automatically update type definitions

## Migration Guide

If you have existing code using invalid color names:

1. **Hex Colors**: Replace with named colors from the palette
   ```tsx
   // Before
   <Text c="#4C5773">Text</Text>
   
   // After
   <Text c="text-secondary">Text</Text>
   ```

2. **CSS Variables**: Use color names directly
   ```tsx
   // Before
   <Text c="var(--mb-color-text-primary)">Text</Text>
   
   // After
   <Text c="text-primary">Text</Text>
   ```

3. **CSS Keywords**: The special keyword "inherit" is allowed for inheriting parent colors
   ```tsx
   // This is valid:
   <Group c="text-secondary">
     <Text c="inherit">This text inherits the parent's color</Text>
   </Group>
   ```
   
   > **Note**: Only "inherit" is allowed. Other CSS keywords like "currentColor", "transparent", or arbitrary hex/rgb values will cause type errors.

4. **Custom Colors**: If you need a color not in the palette, add it to `colorConfig` first

## Extending the Color Palette

To add new colors:

1. Add the color to `getColorConfig()` in `metabase/lib/colors/colors.ts`
2. Define both light and dark mode values
3. The type system will automatically pick up the new color

```typescript
const getColorConfig = (settings: ColorSettings = {}) => ({
  // ... existing colors ...
  "my-new-color": {
    light: baseColors.blue[40],
    dark: baseColors.blue[30],
  },
});
```
