# Dashboard Layout and Responsiveness

This document provides a comprehensive analysis of the dashboard layout system and responsive design patterns for visualizations in the Metabase frontend.

## Table of Contents
1. [Grid System Architecture](#grid-system-architecture)
2. [Layout Management](#layout-management)
3. [Responsiveness Strategy](#responsiveness-strategy)
4. [Visualization Size Adaptation](#visualization-size-adaptation)
5. [Dashboard Card Positioning](#dashboard-card-positioning)
6. [Mobile vs Desktop Experience](#mobile-vs-desktop-experience)
7. [Layout Constraints and Controls](#layout-constraints-and-controls)

## Grid System Architecture

The Metabase dashboard layout system is built on a grid-based architecture with the following key components:

### Core Grid Components

- **DashboardGrid**: The main component that orchestrates the dashboard layout
- **GridLayout**: A wrapper around `react-grid-layout` that handles responsive grid behaviors
- **DashCard**: Individual card components that represent visualizations within the grid

### Grid Configuration

The grid system is configured with the following key constants (in `dashboard_grid.js`):

```javascript
// Basic grid configuration
export const GRID_WIDTH = 24;  // Number of columns in desktop mode
export const GRID_ASPECT_RATIO = 10 / 9;
export const MIN_ROW_HEIGHT = 40;

// Responsive breakpoints
const MOBILE_BREAKPOINT = 752;
export const GRID_BREAKPOINTS = {
  desktop: MOBILE_BREAKPOINT + 1,
  mobile: MOBILE_BREAKPOINT,
};

// Column configuration for different breakpoints
export const GRID_COLUMNS = {
  desktop: GRID_WIDTH,
  mobile: 1,  // Mobile collapses to a single column
};

// Default card size (used when adding new cards)
export const DEFAULT_CARD_SIZE = { width: 4, height: 4 };
```

### Technology Stack

1. **React Grid Layout**: The dashboard uses `react-grid-layout` for:
   - Drag and drop repositioning of cards
   - Resizing of cards
   - Responsive grid behavior across breakpoints

2. **Custom Wrapper Components**:
   - `GridLayout.tsx`: Custom wrapper providing additional functionality
   - `DashboardGrid.tsx`: Main dashboard grid component

3. **Layout Generation**:
   - Desktop layouts are derived from card positioning attributes
   - Mobile layouts are automatically generated based on desktop layouts

## Layout Management

The dashboard layout is managed through a series of interrelated components and utilities:

### Layout Storage

Dashboard layouts are stored in two ways:

1. **Database Storage**: Each dashcard stores `col`, `row`, `size_x`, and `size_y` properties

2. **In-memory State**: The dashboard grid component maintains layouts for different breakpoints:
   ```typescript
   // In DashboardGridState
   layouts: {
     desktop: ReactGridLayout.Layout[];
     mobile: ReactGridLayout.Layout[];
   };
   ```

### Layout Generation

Layouts are generated in several steps:

1. **Initial Layout Generation**:
   ```javascript
   // In grid-utils.ts
   export function getLayouts(cards, initialCardSizes) {
     const desktop = cards.map((card) =>
       getLayoutForDashCard(card, initialCardSizes),
     );
     const mobile = generateMobileLayout(desktop);
     return { desktop, mobile };
   }
   ```

2. **Desktop Layout Generation**:
   ```javascript
   export function getLayoutForDashCard(dashcard, initialCardSizes) {
     const visualization = getVisualizationRaw([{ card: dashcard.card }]);
     // Get minimum size constraints and calculate dimensions
     return {
       i: String(dashcard.id),
       x: dashcard.col || 0,
       y: dashcard.row || 0,
       w: dashcard.size_x || initialSize.width,
       h: dashcard.size_y || initialSize.height,
       minW, minH, dashcard
     };
   }
   ```

3. **Mobile Layout Generation**:
   ```javascript
   export function generateMobileLayout(desktopLayout) {
     const mobile = [];
     desktopLayout.forEach((item) => {
       mobile.push({
         ...item,
         x: 0,  // All items aligned to left
         y: sumVerticalSpace(mobile),  // Stack items vertically
         h: getMobileHeight(item.dashcard.card.display, item.h),
         w: 1,  // Single column
         minW: 1,
       });
     });
     return mobile;
   }
   ```

### Layout Updates

When users modify the dashboard layout during editing:

1. **Dragging & Resizing**:
   ```javascript
   onLayoutChange = ({ layout, breakpoint }) => {
     // Only update layout during editing and on desktop
     if (!isEditing || breakpoint !== "desktop") {
       return;
     }

     // Identify changes to save
     const changes = layout.map(layoutItem => ({
       id: dashboardCard.id,
       attributes: {
         col: layoutItem.x,
         row: layoutItem.y,
         size_x: layoutItem.w,
         size_y: layoutItem.h,
       }
     }));

     setMultipleDashCardAttributes({ dashcards: changes });
   };
   ```

2. **Layout Recalculation**: Happens when dashcards are added, removed, or modified:
   ```javascript
   static getDerivedStateFromProps(nextProps, state) {
     // Get visible cards
     const visibleCards = getVisibleCards(
       dashboard.dashcards,
       visibleCardIds,
       isEditing,
       selectedTabId,
     );

     // Recalculate layouts if necessary
     return {
       initialCardSizes: getInitialCardSizes(visibleCards, state.initialCardSizes),
       layouts: getLayouts(visibleCards, state.initialCardSizes),
     };
   }
   ```

## Responsiveness Strategy

The dashboard implements responsive design through several key mechanisms:

### Breakpoint System

The system uses a straightforward breakpoint approach:

```javascript
const MOBILE_BREAKPOINT = 752;
export const GRID_BREAKPOINTS = {
  desktop: MOBILE_BREAKPOINT + 1,  // > 752px
  mobile: MOBILE_BREAKPOINT,       // <= 752px
};
```

### Layout Transformation

When switching between breakpoints:

1. **Desktop to Mobile**: Cards stack vertically in a single column
   ```javascript
   mobile.push({
     ...item,
     x: 0,
     y: sumVerticalSpace(mobile),
     h: getMobileHeight(card.display, item.h),
     w: 1,
     minW: 1,
   });
   ```

2. **Mobile to Desktop**: Returns to the original multi-column grid layout

### Interaction Differences

Different interaction patterns based on device:

```javascript
<ReactGridLayout
  isDraggable={isEditing && !isMobile}
  isResizable={isEditing && !isMobile}
  // Other props
/>
```

Notably:
- Drag and drop repositioning is only enabled on desktop in editing mode
- Resizing is only enabled on desktop in editing mode
- Mobile layout is always fixed in a single column

### Cell Size Calculation

The grid dynamically calculates cell sizes:

```javascript
const cellSize = useMemo(() => {
  const marginSlotsCount = cols - 1;
  const [horizontalMargin] = margin;
  const totalHorizontalMargin = marginSlotsCount * horizontalMargin;
  const freeSpace = gridWidth - totalHorizontalMargin;

  return {
    width: freeSpace / cols,
    height: rowHeight,
  };
}, [cols, gridWidth, rowHeight, margin]);
```

## Visualization Size Adaptation

Visualizations adapt to different sizes through several mechanisms:

### Default and Minimum Sizes

Each visualization type has defined default and minimum sizes:

```typescript
// From sizes.ts
type VisualizationSize = { width: number; height: number };
const VISUALIZATION_SIZES: Record<
  VisualizationDisplay,
  {
    min: VisualizationSize;
    default: VisualizationSize;
  }
> = CARD_SIZE_DEFAULTS_JSON;
```

### Mobile Height Adaptation

When in mobile view, card heights are adjusted based on their type:

```typescript
export const MOBILE_HEIGHT_BY_DISPLAY_TYPE: Record<
  string,
  number | CalculateMobileHeight
> = {
  action: 1,
  link: 1,
  text: (desktopHeight) => Math.max(2, desktopHeight),
  heading: 2,
  scalar: 4,
};

export const MOBILE_DEFAULT_CARD_HEIGHT = 6;

export const getMobileHeight = (
  display: VisualizationDisplay,
  desktopHeight: number,
) => {
  const mobileHeight =
    MOBILE_HEIGHT_BY_DISPLAY_TYPE[display] ?? MOBILE_DEFAULT_CARD_HEIGHT;

  return typeof mobileHeight === "function"
    ? mobileHeight(desktopHeight)
    : mobileHeight;
};
```

This provides:
- Type-specific height adaptation (e.g., action buttons are smaller)
- Function-based height calculation for complex cases
- Default fallback height for standard visualizations

### Grid Item Width Calculation

Dashboard card components receive their calculated width:

```typescript
const gridItemWidth = cellSize.width * itemLayout.w;

return itemRenderer({
  item,
  gridItemWidth,
  breakpoint: currentBreakpoint,
  totalNumGridCols: cols,
});
```

This width is then passed to child components for proportional sizing.

## Dashboard Card Positioning

Dashboard cards are positioned within the grid using several key mechanisms:

### Automatic Positioning for New Cards

New cards are automatically positioned using an algorithm that finds the first available spot:

```javascript
export function getPositionForNewDashCard(
  cards,
  size_x = DEFAULT_CARD_SIZE.width,
  size_y = DEFAULT_CARD_SIZE.height,
  width = GRID_WIDTH,
) {
  let row = 0;
  let col = 0;
  while (row < 1000) {
    while (col <= width - size_x) {
      let good = true;
      const position = { col, row, size_x, size_y };
      for (const card of cards) {
        if (intersects(card, position)) {
          good = false;
          break;
        }
      }
      if (good) {
        return position;
      }
      col++;
    }
    col = 0;
    row++;
  }
  return { col, row, size_x, size_y };
}
```

### Layout Persistence

Card positions and sizes are stored in the dashboard card model:

```typescript
interface DashboardCardLayoutAttrs {
  col: number;      // x-coordinate
  row: number;      // y-coordinate
  size_x: number;   // width
  size_y: number;   // height
}
```

### Visual Feedback During Editing

When editing, the dashboard provides grid guidelines:

```javascript
const background = useMemo(
  () =>
    generateGridBackground({
      cellSize,
      margin,
      cols,
      gridWidth,
      cellStrokeColor: theme.other?.dashboard?.gridBorderColor,
    }),
  [cellSize, gridWidth, margin, cols, theme],
);

const style = useMemo(
  () => ({
    width: gridWidth,
    height,
    background: isEditing ? background : "",
  }),
  [gridWidth, height, background, isEditing],
);
```

This creates an SVG-based grid that's only visible in editing mode.

## Mobile vs Desktop Experience

The dashboard provides different experiences for mobile and desktop users:

### Desktop Experience

- Multi-column grid layout (typically 24 columns)
- Drag-and-drop editing of card positions
- Resizable cards with minimum size constraints
- Cards maintain their specified aspect ratios

### Mobile Experience

- Single-column layout
- Cards stacked vertically
- No drag-and-drop editing capabilities
- Heights adjusted based on visualization type
- All cards stretch to full width

### Rendering Differences

Special considerations for mobile:

```jsx
<DashCard
  // ...other props
  isMobile={breakpoint === "mobile"}
  gridItemWidth={gridItemWidth}
  totalNumGridCols={totalNumGridCols}
/>
```

Individual visualizations can use this information to adapt:
- Legend placement might change (e.g., move below instead of beside)
- Text size and spacing may be adjusted
- Interactive elements may be enlarged for touch
- Complex visualizations might simplify their display

## Layout Constraints and Controls

The dashboard enforces several constraints to ensure good layouts:

### Minimum Card Sizes

Cards have minimum size constraints based on visualization type:

```javascript
const visualization = getVisualizationRaw([{ card: dashcard.card }]);
const minSize = visualization?.minSize || DEFAULT_CARD_SIZE;

let minW = minSize.width;
let minH = minSize.height;
```

### Fixed Width Dashboard Option

Dashboards can be configured with fixed or fluid width:

```jsx
<Flex
  align="center"
  justify="center"
  className={cx(S.DashboardGridContainer, {
    [S.isFixedWidth]: dashboard?.width === "fixed",
  })}
  style={{
    "--dashboard-fixed-width": FIXED_WIDTH,
  }}
>
  {/* Dashboard content */}
</Flex>
```

With CSS:
```css
.DashboardGridContainer {
  &.isFixedWidth {
    margin: 0 auto;
    max-width: var(--dashboard-fixed-width);
  }
}
```

### Row Height Calculation

Row heights adapt to maintain aspect ratio:

```javascript
getRowHeight() {
  const { width } = this.props;
  
  // Check for vertical scrollbar
  const contentViewportElement = this.context as any;
  const hasScroll =
    contentViewportElement?.clientHeight <
    contentViewportElement?.scrollHeight;

  const aspectHeight = width / GRID_WIDTH / GRID_ASPECT_RATIO;
  const actualHeight = Math.max(aspectHeight, MIN_ROW_HEIGHT);

  // Prevent infinite re-rendering when scroll bar appears/disappears
  return hasScroll ? Math.ceil(actualHeight) : Math.floor(actualHeight);
}
```

This ensures that:
- Rows maintain a consistent aspect ratio (10:9)
- Rows never get smaller than the minimum height (40px)
- Layout remains stable when scrollbars appear/disappear

## Conclusion

The Metabase dashboard layout system combines a powerful grid-based architecture with responsive design techniques to provide a flexible yet constrained dashboard experience. Key patterns include:

1. **Grid-Based Layout**: Built on react-grid-layout with a 24-column desktop grid that collapses to a single column on mobile

2. **Visualization-Specific Sizing**: Each visualization type has predefined minimum and default sizes with special handling for mobile

3. **Automated Mobile Adaptation**: Desktop layouts are automatically transformed into mobile-friendly vertical layouts

4. **Dynamic Size Calculation**: Cell sizes and row heights dynamically adjust based on available space while maintaining aspect ratios

5. **Constrained Editing Experience**: Minimum sizes and position constraints ensure good visualization rendering

6. **Fixed Width Option**: Support for both fluid and fixed-width dashboards

This architecture balances flexibility for dashboard creators with a consistent, responsive experience for users across device types.