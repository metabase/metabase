# Issue #51711: Goal line label can overlap with series labels

## Difficulty Score: 5/10

## Issue Description
When a goal line is added to a chart, the goal line label can overlap with series labels, creating visual confusion and making data harder to interpret. The issue appears to occur because there's no collision detection or positioning logic to prevent the goal line label from overlapping with series labels.

## Technical Components
- **ECharts Integration**: Metabase uses ECharts for chart rendering, including goal lines and data labels
- **Chart Label Positioning**: Both goal line labels and series labels have fixed positioning logic that doesn't account for potential overlap
- **Goal Line Implementation**: Found in `frontend/src/metabase/visualizations/echarts/cartesian/option/goal-line.ts`
- **Series Label Implementation**: Found in multiple files, primarily `frontend/src/metabase/visualizations/echarts/cartesian/option/series.ts`

## Technical Analysis

The goal line label positioning is defined in `goal-line.ts` with these key lines:
```typescript
const hasRightYAxis = chartModel.rightAxisModel == null;
const align = hasRightYAxis ? ("right" as const) : ("left" as const);
const labelX = hasRightYAxis ? xEnd : xStart;
const labelY = y - fontSize - CHART_STYLE.goalLine.label.margin;
```

The goal line label is positioned with a fixed offset above the goal line itself. There's no logic to detect potential overlaps with series labels.

Series labels for data points are positioned through various methods in `series.ts`:
- For bar charts: `getBarLabelLayout` and `getBarInsideLabelLayout`
- For line/area charts: Labels are positioned using the `buildEChartsLabelOptions` function with a hard-coded "top" position

The Z-index settings in `constants/style.ts` also play a role:
```typescript
export const Z_INDEXES = {
  dataLabels: 8,
  goalLine: 7,
  trendLine: 7,
  lineAreaSeries: 7,
  series: 6,
};
```

Even though the goal line has a lower z-index than data labels, they can still visually overlap because they occupy the same physical space in the chart.

## Implementation Details

The issue stems from:
1. Fixed positioning of goal line labels that doesn't account for data labels
2. No collision detection between different types of labels
3. No automatic repositioning logic when overlaps occur

## Resolution Factors

### Approach Options:
1. **Smart positioning**: Detect potential overlaps and adjust the goal line label position (move it higher, to the side, etc.)
2. **Collision avoidance**: Implement a collision detection system for all labels in the chart
3. **User control**: Add settings to allow users to control goal line label position

### Implementation Complexity:
- Medium complexity due to the need to calculate label bounds and detect overlaps
- ECharts provides some built-in label positioning capabilities that could be leveraged
- The existing `hideOverlap` property that's used for data labels doesn't seem to apply across different label types

### Testing Requirements:
- Test with various chart types and data scenarios
- Test with multiple goal lines
- Test with different chart sizes
- Test with different label text lengths

## Assessment
This is a moderate difficulty task that requires understanding of how ECharts positions labels and how to detect and resolve overlaps. The main challenge is calculating the bounds of different labels and implementing a smart positioning algorithm that works reliably across different chart types and data densities.

The implementation will need to:
1. Calculate positions and dimensions of both series labels and goal line labels
2. Detect potential overlaps before rendering
3. Adjust the goal line label position when overlaps are detected

A possible approach is to modify the `getGoalLineSeriesOption` function in `goal-line.ts` to be aware of series label positions and adjust the `labelY` value to ensure proper spacing. This might require passing additional information about series label positions to this function.

### Estimated Fix Time
- 4-6 hours for a developer familiar with the Metabase visualization system and ECharts