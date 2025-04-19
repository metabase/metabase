# Theming and Styling System

This document analyzes the theming and styling system used in Metabase's visualizations, focusing on global theme integration, CSS architecture, color palette management, and accessibility considerations.

## Core Architecture

Metabase employs a multi-layered theming architecture that combines CSS variables, TypeScript utilities, and component-specific styling to create a cohesive and customizable visual experience.

### Color System

#### Base Palette

The color system is defined in `/frontend/src/metabase/lib/colors/palette.ts` and synchronized with CSS variables in `/frontend/src/metabase/css/core/colors.module.css`. The palette includes:

1. **Brand Colors**: Primary colors that define Metabase's identity
   ```typescript
   export const colors = {
     brand: "#509EE3",
     summarize: "#88BF4D",
     filter: "#7172AD",
     // ...
   }
   ```

2. **Accent Colors**: A set of 8 distinct colors for visualizations
   ```typescript
   accent0: "#509EE3",
   accent1: "#88BF4D",
   accent2: "#A989C5",
   accent3: "#EF8C8C",
   accent4: "#F9D45C",
   accent5: "#F2A86F",
   accent6: "#98D9D9",
   accent7: "#7172AD",
   ```

3. **Semantic Colors**: Colors with specific meanings
   ```typescript
   success: "#84BB4C",
   danger: "hsla(358, 71%, 62%, 1)",
   error: "hsla(358, 71%, 62%, 1)",
   warning: "#F9CF48",
   ```

4. **UI Colors**: Colors for text, backgrounds, and borders
   ```typescript
   "text-dark": "#4C5773",
   "text-medium": "#696E7B",
   "text-light": "#949AAB",
   "text-white": "#FFFFFF",
   "bg-dark": "#93A1AB",
   "bg-medium": "#EDF2F5",
   "bg-light": "#F9FBFC",
   ```

#### CSS Variables

The system uses CSS variables with a semantic naming convention:

```css
:root {
  /* Semantic colors */
  --mb-color-brand: var(--mb-base-color-blue-40);
  --mb-color-brand-light: color-mix(in srgb, var(--mb-color-brand), #fff 80%);
  --mb-color-brand-lighter: color-mix(in srgb, var(--mb-color-brand), #fff 90%);
  
  /* Base colors */
  --mb-base-color-blue-40: #509ee3; /* brand */
  --mb-base-color-blue-30: #8dc0ed;
  --mb-base-color-blue-20: #cbe2f7; /* focus */
}
```

This structure provides:
- Clear semantic meaning for colors
- The ability to customize colors while maintaining relationships
- Support for dark mode and white-labeling

#### Color Utilities

The codebase includes utility functions for manipulating colors:

```typescript
export const alpha = (c: string, a: number) => {
  return Color(color(c)).alpha(a).string();
};

export const lighten = (c: string, f: number = 0.5) => {
  return Color(color(c)).lighten(f).string();
};

export const darken = (c: string, f: number = 0.25) => {
  return Color(color(c)).darken(f).string();
};
```

These functions are being deprecated in favor of CSS `color-mix()` for better performance and maintainability.

### Visualization-Specific Theming

#### ECharts Integration

Metabase uses ECharts for many of its visualizations, with custom theme integration defined in `/frontend/src/metabase/visualizations/shared/utils/theme.ts`:

```typescript
export function getVisualizationTheme({
  theme,
  isDashboard,
  isNightMode,
  isStaticViz,
}): VisualizationTheme {
  const { cartesian, dashboard, question } = theme;
  
  // ECharts requires font sizes in px for offset calculations.
  const px = (value: string) =>
    getSizeInPx(value, baseFontSize) ?? baseFontSize ?? 14;

  return {
    cartesian: {
      label: { fontSize: px(cartesian.label.fontSize) },
      goalLine: {
        label: { fontSize: px(cartesian.goalLine.label.fontSize) },
      },
    },
    pie: {
      borderColor: isStaticViz
        ? color("text-white")
        : getPieBorderColor(
            dashboard.card.backgroundColor,
            question.backgroundColor,
            isDashboard,
            isNightMode,
          ),
    },
  };
}
```

The theme includes sizing, fonts, and colors that are applied to ECharts options in visualization renderers.

#### Chart Colors

Chart colors are managed through the `getColorsForValues` function in `/frontend/src/metabase/lib/colors/charts.ts`:

```typescript
export const getColorsForValues = (
  keys: string[],
  existingMapping?: Record<string, string> | null,
  palette?: ColorPalette,
) => {
  if (keys.length <= ACCENT_COUNT) {
    return getHashBasedMapping(
      keys,
      getAccentColors({ light: false, dark: false, gray: false }, palette),
      existingMapping,
      (color: string) => getPreferredColor(color, palette),
    );
  } else {
    return getOrderBasedMapping(
      keys,
      getAccentColors(
        { light: keys.length > ACCENT_COUNT * 2, harmony: true, gray: false },
        palette,
      ),
      existingMapping,
      (color: string) => getPreferredColor(color, palette),
    );
  }
};
```

This system:
- Intelligently assigns colors to data series
- Persists color assignments for consistency
- Handles semantic mappings (e.g., "success" → green)
- Adjusts for large numbers of series by adding lighter variants

#### Component Styling

Individual visualization components use a variety of styling approaches:

1. **Styled Components**: For complex components with dynamic styling
   ```typescript
   // Example from a styled component file
   export const RowCell = styled.td<RowCellProps>`
     padding: 0.75rem 1rem;
     position: relative;
     min-width: 1rem;
     line-height: 1.429em;
     text-align: ${props => (props.isRightAligned ? "right" : "left")};
     cursor: ${props => (props.isClickable ? "pointer" : "default")};
   `;
   ```

2. **CSS Modules**: For component-specific styling with proper scoping
   ```typescript
   // Component using CSS modules
   import styles from "./Component.module.css";
   
   <div className={styles.container}>...</div>
   ```

3. **Mantine UI Library**: For standard UI components with consistent theming
   ```typescript
   // Using Mantine components with theme
   <Box className={cx(CS.flex, CS.alignCenter)} {...boxProps}>
     <ColorSelector
       value={value}
       colors={getAccentColors(accentColorOptions)}
       onChange={onChange}
     />
   </Box>
   ```

## Dark Mode Support

Metabase includes built-in dark mode support, primarily through CSS variables and theme-specific classes.

### Dark Mode Implementation

The main dark mode implementation is in the CSS variables:

```css
.DashboardNight .bgLight {
  background-color: var(--mb-color-bg-black);
}

.DashboardNight .bgMedium {
  background-color: #596269;
}

.DashboardNight .textDark {
  color: var(--mb-color-bg-light);
}
```

This pattern:
- Uses a `.DashboardNight` wrapper class to scope dark mode styles
- Overrides specific color variables for dark mode
- Preserves the semantic relationship between colors

### Visualization Adaptations

Visualizations adapt to dark mode through the `isNightMode` flag passed to rendering functions:

```typescript
function getPieBorderColor(
  dashboardCardBg: string,
  questionBg: string,
  isDashboard: boolean | undefined,
  isNightMode: boolean | undefined,
) {
  if (isDashboard && isNightMode) {
    return "var(--mb-color-bg-night)";
  }
  // ...
}
```

Charts use different color palettes and styling in dark mode to maintain readability while preserving the overall design language.

## Accessibility Considerations

Metabase's visualization styling includes several accessibility features:

### Text Contrast

The system includes a utility function to determine appropriate text color based on background contrast:

```typescript
export const getTextColorForBackground = (
  backgroundColor: string,
  getColor: ColorGetter = color,
) => {
  const whiteTextContrast =
    Color(getColor(backgroundColor)).contrast(Color(getColor("text-white"))) *
    whiteTextColorPriorityFactor;
  const darkTextContrast = Color(getColor(backgroundColor)).contrast(
    Color(getColor("text-dark")),
  );

  return whiteTextContrast > darkTextContrast
    ? getColor("text-white")
    : getColor("text-dark");
};
```

Interestingly, Metabase intentionally weights the calculation to prefer white text slightly more often:

```typescript
// We intentionally want to return white text color more frequently
// https://www.notion.so/Maz-notes-on-viz-settings-...
const whiteTextColorPriorityFactor = 3;
```

### Font Sizing

The theme system supports configurable font sizes with relative units:

```typescript
// Use em units to scale font sizes relative to the base font size.
// The em unit is used by default in the embedding SDK.
const units = (px: number) => ({
  px: `${px}px`,
  em: `${px / DEFAULT_SDK_FONT_SIZE}em`,
});

const FONT_SIZES = {
  tableCell: units(12.5),
  pivotTableCell: units(12),
  label: units(12),
  goalLabel: units(14),
};
```

This approach allows:
- Font sizes to scale appropriately with user preferences
- Support for zoom and browser font size settings
- Consistent sizing relationships between elements

## Embedding SDK Theming

Metabase provides an embedding SDK with enhanced theming capabilities:

```typescript
export interface MetabaseTheme {
  /** Base font size. Supported units are px, em and rem. */
  fontSize?: string;

  /** Font family that will be used for all text */
  fontFamily?: MetabaseFontFamily | (string & {});

  /** Base line height */
  lineHeight?: string | number;

  /** Color palette */
  colors?: MetabaseColors;

  /** Component theme options */
  components?: DeepPartial<MetabaseComponentTheme>;
}
```

This enables embedding customers to customize Metabase visualizations to match their own design systems.

## Conclusion

Metabase's visualization styling system is comprehensive and well-structured, with several key characteristics:

1. **Layered Architecture**: From base colors to semantic variables to component-specific styling
2. **CSS Variables**: Modern CSS approach with strong support for theming
3. **Utility Functions**: Helper functions for color manipulation, contrast, and sizing
4. **Accessibility**: Built-in considerations for contrast, readability, and font sizing
5. **Dark Mode**: First-class support for dark theme through CSS variables
6. **Embedding**: Extensible theming for embedded visualizations
7. **Consistent Color Assignment**: Smart system for assigning and maintaining chart colors

The system is in transition from direct hex color manipulation to CSS variables for better performance and maintainability. There are explicit deprecation comments encouraging the use of CSS variables and `color-mix()` over JavaScript color manipulation functions.

Overall, the theming architecture strikes a good balance between consistency, customization, and performance, providing a solid foundation for Metabase's visualizations.