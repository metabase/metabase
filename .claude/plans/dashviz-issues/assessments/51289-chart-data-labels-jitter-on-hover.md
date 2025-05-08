# Issue #51289: Charts with data labels jitter slightly when hovered on

## Difficulty Score: 4/10

## Issue Description
When hovering over bars in charts with data labels, the labels jitter slightly up and down (about 1px). This creates a visual distraction and makes the charts appear less polished. The issue is likely related to how data label animations, transitions, or positioning are handled during hover states.

## Technical Components
- **ECharts Integration**: Metabase uses ECharts for chart rendering
- **Hover States**: ECharts implements hover via emphasis/blur states
- **Label Positioning**: Labels may be repositioned during hover events
- **Animation Settings**: ECharts has animation controls that might affect hover behavior

## Technical Analysis

The issue appears to stem from how ECharts handles label positioning during hover interactions. Key relevant code:

1. In `cartesian/option/index.ts`, animation settings are defined:
```typescript
export const getSharedEChartsOptions = (isAnimated: boolean) => ({
  useUTC: true,
  animation: isAnimated,
  animationDuration: 0,
  animationDurationUpdate: 1, // by setting this to 1ms we visually eliminate shape transitions while preserving opacity transitions
  // ...
});
```

2. In `cartesian/option/series.ts`, the handling of labels during hover states (emphasis):
```typescript
if (seriesOption?.label != null) {
  seriesOption.label.show = false;
}
if (seriesOption?.emphasis != null) {
  seriesOption.emphasis.label = { show: true };
}
```

3. Also in `series.ts`, the bar chart emphasis settings:
```typescript
emphasis: {
  focus: hasMultipleSeries ? "series" : "self",
  itemStyle: {
    color: seriesModel.color,
  },
},
```

The jittering is likely caused by one of these factors:
1. The label is being hidden and then shown during hover states, causing a position recalculation
2. The `animationDurationUpdate: 1` setting is allowing minimal but still visible transitions
3. There might be slight differences in how the label position is calculated in normal vs. emphasized states

## Implementation Details

ECharts doesn't expose a direct setting to fix this type of jittering. The solution would likely involve:

1. Ensuring consistent label positioning between normal and hover states
2. Possibly disabling animations/transitions for labels specifically during hover
3. Testing different emphasis configuration options

## Resolution Factors

### Approach Options:
1. **Modify animation settings**: Completely disable animations during hover transitions
2. **Consistent label handling**: Ensure labels aren't toggled off/on during hover state changes
3. **Custom ECharts option**: Add a custom option to stabilize label positions

### Implementation Complexity:
- Low to medium complexity
- Will require testing across different chart types to ensure the fix doesn't create other issues
- May need to investigate ECharts documentation for undocumented options or behaviors

### Testing Requirements:
- Test with different chart types (bar, line, area)
- Test with different data densities
- Test with stacked vs. unstacked charts
- Verify the fix works consistently across browsers

## Assessment
This is a relatively straightforward visual polish issue that likely stems from how ECharts handles hover state transitions. The most promising solution is to modify how label visibility is handled during hover states.

Currently, when hovering on a bar chart, the label is completely hidden and then shown in the emphasis state:
```typescript
if (seriesOption?.label != null) {
  seriesOption.label.show = false; // Hide in normal state
}
if (seriesOption?.emphasis != null) {
  seriesOption.emphasis.label = { show: true }; // Show in hover state
}
```

This toggling likely causes the position to be recalculated, resulting in the jitter. A better approach might be to:
1. Keep labels visible in both states but with different styling
2. Explicitly set the same positioning in both states
3. Set `animation: false` for label changes specifically

The key is to avoid any repositioning calculations happening during the hover state change.

### Estimated Fix Time
- 2-3 hours for a developer familiar with ECharts to implement and test a solution