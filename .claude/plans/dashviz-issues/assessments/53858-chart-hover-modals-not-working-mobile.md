# Issue #53858: Chart hover modals no longer working on mobile browsers

**URL**: https://github.com/metabase/metabase/issues/53858  
**Priority**: P3  
**Type**: Bug  
**Reporter**: SteveAltham  
**Updated**: April 1, 2025

## Difficulty Score: 4/10

## Issue Description
On mobile browsers, the chart hover information (tooltips) for bar charts and other visualizations only briefly flashes and then disappears when tapping on a data point. This functionality used to work correctly in previous versions (before v0.51), where a tap on mobile would simulate a hover action on desktop, displaying the detailed information modal. This regression makes it difficult for mobile users to view detailed information about chart data points.

## Technical Complexity

### Core Components Involved
1. **Chart Visualization Components**
   - `Visualization.tsx` - Main visualization component with hover handling
   - `ChartTooltip.tsx` - Component for displaying hover information
   - The ECharts integration which handles rendering and interactions

2. **Touch/Mobile Handling**
   - How touch events are translated to hover events
   - The hover state management in mobile contexts

### Implementation Analysis
The issue is in how mobile touch events are handled by the visualization components. In the `Visualization.tsx` component, the hover state is managed through the `handleHoverChange` method:

```typescript
handleHoverChange = (hovered: HoveredObject | null | undefined) => {
  if (hovered) {
    this.setState({ hovered });
    // If we previously set a timeout for clearing the hover clear it now since we received
    // a new hover.
    if (this._resetHoverTimer !== null) {
      clearTimeout(this._resetHoverTimer);
      this._resetHoverTimer = null;
    }
  } else {
    // When resetting the hover wait in case we're simply transitioning from one
    // element to another. This allows visualizations to use mouseleave events etc.
    this._resetHoverTimer = window.setTimeout(() => {
      this.setState({ hovered: null });
      this._resetHoverTimer = null;
    }, 0);
  }
};
```

The problem appears to be that on mobile devices, the hover state is being reset immediately after being set. This is likely due to differences in how touch events work compared to mouse events:

1. On desktop, a mouseenter event sets the hover, and a mouseleave event clears it
2. On mobile, a touch event might be triggering both the hover and an immediate clearing of the hover

The regression might have been introduced in v0.51 with changes to the ECharts integration or how touch events are handled in the visualization components.

### Resolution Factors

**Localization Considerations**: None - This is a purely interaction-based fix with no text changes.

**Testing Requirements**: Medium - Testing on multiple mobile devices and browsers is necessary.

**Fix Complexity**: Medium - The fix will involve modifying how touch events are translated to hover states for mobile devices.

## Overall Assessment
This is a user experience regression that significantly impacts mobile users' ability to interact with charts. The bug appears to be in how the hover state is managed for touch events on mobile devices.

The fix would likely involve:
1. Modifying the `handleHoverChange` method to handle touch events differently than mouse events
2. Adding a delay before clearing the hover state on mobile devices
3. Potentially adding mobile-specific logic to keep tooltips visible until another action is taken

A good approach would be to:
1. Detect if the device is mobile/touch-based
2. If on a mobile device, modify the hover behavior to keep the hover state active longer
3. Potentially implement a tap-to-show, tap-elsewhere-to-hide model for mobile

Alternatively, a direct fix to the ECharts integration might be needed, ensuring that mobile touch events properly maintain the hover state until explicitly cleared by another action.

Estimated time to fix: 3-4 hours, including testing across multiple mobile devices and browsers.