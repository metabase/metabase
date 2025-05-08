# Issue #52211: Dashboard with Full Width setting enabled causes odd rendering for Text Cards with different resolutions

**URL**: https://github.com/metabase/metabase/issues/52211  
**Priority**: P3  
**Type**: Bug  
**Reporter**: Tony-metabase  
**Updated**: April 1, 2025

## Difficulty Score: 3/10

## Issue Description
When using the Full Width setting on dashboards, text cards can render inconsistently across different screen sizes or iframe embeds. Specifically, text that looks fine in one resolution may get cut off or display oddly in another. This issue is particularly problematic when embedding dashboards in iframes of various sizes, as it makes text content less predictable and consistent compared to when the Full Width setting is disabled.

## Technical Complexity

### Core Components Involved
1. **Dashboard Layout System**
   - `DashboardGrid.tsx` - Main grid layout component
   - `FixedWidthContainer` - Component that implements the Full Width setting
   - Text card rendering and responsive behavior

2. **Responsive Layout Code**
   - Dashboard's CSS module defining fixed width versus full width behavior
   - React Grid Layout configuration for text cards

### Implementation Analysis
The issue occurs because of how the dashboard layout works when Full Width is enabled versus disabled. Looking at the code:

1. When Full Width is enabled, the dashboard expands to fill the available width of the container, which means:
   ```typescript
   // FixedWidthContainer.tsx
   export const FixedWidthContainer = (
     props: BoxProps & {
       isFixedWidth: boolean;
       children: React.ReactNode;
       id?: string;
     },
   ) => {
     const { isFixedWidth, className, ...rest } = props;
     return (
       <Box
         w="100%"
         className={cx(
           S.FixedWidthContainer,
           { [S.isFixedWidth]: isFixedWidth },
           className,
         )}
         style={{
           "--dashboard-fixed-width": FIXED_WIDTH,
         }}
         {...rest}
       />
     );
   };
   ```

2. The CSS defines the behavior:
   ```css
   .FixedWidthContainer {
     &.isFixedWidth {
       margin: 0 auto;
       max-width: var(--dashboard-fixed-width);
     }
   }
   ```

3. For text cards, when the width changes, the height adjusts to maintain aspect ratio as mentioned in the comments:
   > we preserve aspect ratio of dashboard cards so when resizing as the width is changing the height will change as well. And when full width is disabled, since width becomes fixed, height also do not change.

The problem is that text content doesn't naturally scale well with aspect ratio changes. When width changes dramatically, text doesn't reflow properly within the card boundaries, leading to content being cut off or displaying oddly.

### Resolution Factors

**Localization Considerations**: Low - This is primarily a layout/CSS issue rather than a text/translation issue.

**Testing Requirements**: Medium - Requires testing across multiple screen sizes and iframe dimensions.

**Fix Complexity**: Medium - The fix likely involves adjusting how text cards specifically handle responsive layout within the dashboard grid.

## Overall Assessment
This is a user experience issue that affects the reliability and consistency of text cards in dashboards with Full Width enabled. It's especially problematic for embedded dashboards where controlling the container size is more difficult.

The fix would likely involve:
1. Modifying how text cards specifically handle resize events when in Full Width mode
2. Either making text reflow more intelligently within the card boundaries or
3. Adjusting how aspect ratio preservation works specifically for text cards

One approach could be to make text cards automatically adjust their height based on content rather than strictly following aspect ratio preservation. This would ensure that all text remains visible regardless of width, which is likely what users expect from text content (unlike charts where maintaining aspect ratio is more important visually).

Estimated time to fix: 3-4 hours, including testing across multiple screen sizes and iframe configurations.