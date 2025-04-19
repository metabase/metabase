# Performance Optimization Techniques in Metabase Visualizations

This document examines the performance optimization techniques employed in Metabase's visualization system to ensure responsive and efficient rendering, particularly for dashboards with many charts or visualizations with large datasets.

## Table of Contents

1. [Component Memoization](#component-memoization)
2. [Data Fetching and Caching](#data-fetching-and-caching)
3. [Virtualization for Large Datasets](#virtualization-for-large-datasets)
4. [Deferred and Debounced Updates](#deferred-and-debounced-updates)
5. [Loading States and Progressive Rendering](#loading-states-and-progressive-rendering)
6. [Resource Management](#resource-management)

## Component Memoization

Metabase employs several approaches to memoization to prevent unnecessary renders and expensive recalculations.

### Class Method Memoization

Metabase has a sophisticated system for memoizing class methods, implemented in `/frontend/src/metabase-lib/v1/utils/memoize-class.ts`:

```typescript
/**
 * This method implements memoization for class methods
 * It creates a map where class itself, method and all the parameters are used as keys for a nested map
 * map<class, map<method, map<param1, map<param2, map<param3...>>>>>
 *
 * If you use objects as parameters, make sure their references are stable as they will be used as keys
 *
 * @param keys - class methods to memoize
 * @returns the same class with memoized methods
 */
export function memoizeClass<T>(
  ...keys: string[]
): (Class: Constructor<T>) => Constructor<T> {
  return (Class: Constructor<T>): Constructor<T> => {
    // Implementation details
  };
}
```

This utility is used throughout the codebase, particularly in visualization components. For example, in the `Visualization` component:

```typescript
const VisualizationMemoized = memoizeClass<Visualization>(
  "_getQuestionForCardCached",
)(Visualization);
```

### React.memo and UseMemo

React's `memo` and `useMemo` hooks are widely used in visualization components:

- `React.memo` is applied to functional components to prevent unnecessary re-renders when props haven't changed.
- `useMemo` is used to memoize expensive calculations or object creations.

For example, in chart components:

```typescript
// From CartesianChart.tsx
const models = useMemo(() => {
  return getCartesianChartModels(series, settings);
}, [series, settings]);

// From RowChart.tsx
const option = useMemo(() => {
  return getRowChartOption(model, theme, onHover, onClick);
}, [model, theme, onHover, onClick]);
```

### PureComponent and Selective Re-rendering

The main `Visualization` component extends `PureComponent` for shallow prop comparison, and additionally implements custom comparison logic in `getDerivedStateFromProps` to control when a complete re-derivation of state is necessary:

```typescript
static getDerivedStateFromProps(
  props: VisualizationProps,
  state: VisualizationState,
) {
  // Only re-derive state when specific props have changed
  if (
    !isSameSeries(props.rawSeries, state._lastProps?.rawSeries) ||
    !equals(props.settings, state._lastProps?.settings) ||
    !equals(props.timelineEvents, state._lastProps?.timelineEvents) ||
    !equals(
      props.selectedTimelineEventIds,
      state._lastProps?.selectedTimelineEventIds,
    )
  ) {
    return {
      ...deriveStateFromProps(props),
      // Reset state values and store last props
    };
  }
  return null;
}
```

## Data Fetching and Caching

Dashboard visualizations rely on efficient data fetching and caching strategies to minimize redundant network requests.

### Intelligent Caching

The `fetchCardData` function in `/frontend/src/metabase/dashboard/actions/data-fetching.ts` implements a sophisticated caching mechanism:

```typescript
// Check if a cached result exists and can be used
if (!reload) {
  if (
    lastResult &&
    equals(
      getDatasetQueryParams(lastResult.json_query),
      getDatasetQueryParams(datasetQuery),
    )
  ) {
    return {
      dashcard_id: dashcard.id,
      card_id: card.id,
      result: lastResult,
    };
  }
}
```

This caching strategy:
- Checks if a previous result exists with the same query parameters
- Skips refetching if the parameters match, unless explicitly told to reload
- Uses parameter equality to determine cache validity

### Request Cancellation

Metabase implements a request cancellation system to prevent race conditions when rapidly changing parameters or navigating between dashboards:

```typescript
export const cancelFetchCardData = createAction(
  CANCEL_FETCH_CARD_DATA,
  (card_id, dashcard_id) => {
    const deferred = cardDataCancelDeferreds[`${dashcard_id},${card_id}`];
    if (deferred) {
      deferred.resolve();
      cardDataCancelDeferreds[`${dashcard_id},${card_id}`] = null;
    }
    return { payload: { dashcard_id, card_id } };
  },
);
```

When navigating to a new dashboard or changing filters, all in-flight requests for the previous state are cancelled, preventing stale data from appearing and reducing unnecessary network load.

### Parallel Data Fetching

Dashboard visualization data is fetched in parallel to improve loading times:

```typescript
const promises = nonVirtualDashcardsToFetch.map(
  async ({ card, dashcard }) => {
    await dispatch(
      fetchCardData(card as Card, dashcard, {
        reload,
        clearCache,
        dashboardLoadId,
      }),
    );
    await dispatch(updateLoadingTitle(nonVirtualDashcardsToFetch.length));
  },
);

return Promise.all(promises).then(() => {
  dispatch(loadingComplete());
});
```

Each card fetches its data independently, allowing them to load as quickly as possible rather than sequentially.

### Performance Monitoring

The data fetching system includes performance monitoring for slow-loading cards:

```typescript
// start a timer that will show the expected card duration if the query takes too long
const slowCardTimer = setTimeout(() => {
  if (result === null) {
    dispatch(markCardAsSlow(card));
  }
}, DASHBOARD_SLOW_TIMEOUT);
```

This approach:
- Sets a timeout based on an expected performance threshold
- Marks cards that exceed this threshold as "slow"
- Provides visual feedback to users about slow-loading visualizations
- Helps identify performance problems in specific cards

## Virtualization for Large Datasets

For visualizations with large datasets, particularly tables, Metabase implements virtualization to only render the visible portions of the data.

### Virtual Grid Implementation

The `useVirtualGrid` hook in `/frontend/src/metabase/data-grid/hooks/use-virtual-grid.tsx` provides virtualization for both rows and columns:

```typescript
export const useVirtualGrid = <TData,>({
  gridRef,
  table,
  measureRowHeight,
  defaultRowHeight,
  enableRowVirtualization,
}: VirtualGridOptions<TData>): VirtualGrid => {
  const { rows: tableRows } = table.getRowModel();
  const visibleColumns = table.getVisibleLeafColumns();

  const columnVirtualizer = useVirtualizer({
    count: visibleColumns.length,
    getScrollElement: () => gridRef.current,
    estimateSize: (index) => {
      // Column width estimation logic
    },
    overscan: 3,
    horizontal: true,
  });

  const rowVirtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => gridRef.current,
    estimateSize: () => defaultRowHeight,
    overscan: 3,
    enabled: enableRowVirtualization,
    measureElement: (element) => {
      // Dynamic row height measurement
    },
  });

  // Rest of implementation
};
```

This virtualization system:
- Measures the visible viewport
- Only renders rows and columns currently visible in the viewport
- Efficiently handles scroll events to update the visible window
- Includes "overscan" to pre-render additional rows/columns for smoother scrolling
- Supports dynamic measurement of row heights based on content

### Virtualized Rendering in DataGrid

The `DataGrid` component uses the virtual grid to efficiently render only the necessary DOM elements:

```typescript
{getVisibleRows().map((maybeVirtualRow) => {
  const { row, virtualRow } = isVirtualRow(maybeVirtualRow)
    ? maybeVirtualRow
    : { row: maybeVirtualRow, virtualRow: undefined };

  const virtualRowStyles: React.CSSProperties =
    virtualRow != null
      ? {
          position: "absolute",
          minHeight: `${virtualRow.size}px`,
          transform: `translateY(${virtualRow.start}px)`,
        }
      : {};

  return (
    <div
      role="row"
      key={row.id}
      ref={rowMeasureRef}
      data-dataset-index={row.index}
      style={{
        ...virtualRowStyles,
        // Other styles
      }}
    >
      {/* Row content */}
    </div>
  );
})}
```

This approach:
- Uses absolute positioning to place rows in their correct visual position
- Only renders DOM elements for visible rows
- Applies CSS transforms instead of changing the DOM structure during scrolling
- Maintains smooth performance even with thousands of rows of data

### Smart Pinning with Virtualization

The grid supports pinned columns while maintaining virtualization for the rest:

```typescript
rangeExtractor: useCallback(
  (range: Range) => {
    const columnIndices = defaultRangeExtractor(range);
    if (pinnedColumnsIndices.length === 0) {
      return columnIndices;
    }
    return Array.from(new Set([...pinnedColumnsIndices, ...columnIndices]));
  },
  [pinnedColumnsIndices],
),
```

This ensures that pinned columns are always rendered while still virtualizing the rest of the table.

## Deferred and Debounced Updates

Metabase implements various techniques to avoid excessive updates during user interactions.

### Debounced Window Resize

Components that need to respond to window resize events use debouncing to prevent excessive updates:

```typescript
useEffect(() => {
  const handleResize = _.debounce(forceUpdate, 100);
  window.addEventListener("resize", handleResize);
  return () => window.removeEventListener("resize", handleResize);
}, [forceUpdate]);
```

### Throttled Size Monitoring

The `ExplicitSize` higher-order component monitors size changes with configurable throttling strategies:

```typescript
ExplicitSize<VisualizationProps>({
  selector: ".CardVisualization",
  refreshMode: (props) => (props.isVisible ? "throttle" : "debounceLeading"),
})
```

It uses different refresh modes depending on whether the component is visible, optimizing performance by reducing updates for hidden components.

### Delayed State Updates

In some cases, state updates are explicitly delayed to prevent flickering or rapid successive updates:

```typescript
// From Visualization.tsx, handleVisualizationClick method
setTimeout(() => {
  this.setState({ clicked });
}, 100);
```

## Loading States and Progressive Rendering

Metabase provides feedback to users during data loading while optimizing the rendering process.

### Loading Indicators

Dashboard cards show loading states while data is being fetched:

```typescript
{loading ? (
  <LoadingView
    expectedDuration={expectedDuration}
    isSlow={!!isSlow}
  />
) : (
  // Actual visualization
)}
```

### Loading Progress Tracking

The dashboard tracks overall loading progress and updates the document title accordingly:

```typescript
export const updateLoadingTitle = createThunkAction(
  SET_DOCUMENT_TITLE,
  (totalCards) => (_dispatch, getState) => {
    const loadingDashCards = getLoadingDashCards(getState());
    const loadingComplete = totalCards - loadingDashCards.loadingIds.length;
    return `${loadingComplete}/${totalCards} loaded`;
  },
);
```

This provides users with feedback about the overall dashboard loading progress.

### Slow Card Detection

Cards that take a long time to load are marked with a special indicator:

```typescript
// start a timer that will show the expected card duration if the query takes too long
const slowCardTimer = setTimeout(() => {
  if (result === null) {
    dispatch(markCardAsSlow(card));
  }
}, DASHBOARD_SLOW_TIMEOUT);
```

## Resource Management

Metabase implements careful resource management to prevent memory leaks and excessive CPU usage.

### Cleanup of Event Listeners

Components properly clean up event listeners when unmounting:

```typescript
useEffect(() => {
  const handleResize = _.debounce(forceUpdate, 100);
  window.addEventListener("resize", handleResize);
  return () => window.removeEventListener("resize", handleResize);
}, [forceUpdate]);
```

### Timer Management

Timers are consistently cleared to prevent memory leaks:

```typescript
clearTimeout(slowCardTimer);
```

### Lazy Loading of Resources

Some resources are only loaded when needed:

```typescript
// From data-fetching.ts
const endpoint = shouldUseCardQueryEndpoint
  ? CardApi.query
  : DashboardApi.cardQuery;
```

This pattern ensures that only the necessary endpoints are called based on the current context.

### ECharts Instance Management

ECharts instances are carefully managed to prevent memory leaks and ensure proper rendering:

```typescript
// From EchartsBaseComponent.tsx
useEffect(() => {
  if (!chartRef.current) {
    return;
  }

  const chart = echarts.init(chartRef.current);
  setChart(chart);

  return () => {
    chart.dispose();
  };
}, []);
```

The cleanup function properly disposes of chart instances when components unmount.

## Conclusion

Metabase's visualization system employs a comprehensive set of performance optimization techniques to ensure responsive and efficient rendering even with large datasets and complex dashboards. These techniques include:

1. Smart memoization at multiple levels (class methods, components, and calculations)
2. Sophisticated data fetching with caching and request cancellation
3. Virtualization for efficiently rendering large datasets
4. Deferred and debounced updates to manage rapid user interactions
5. Progressive loading states to provide feedback during data fetching
6. Careful resource management to prevent memory leaks

These approaches together create a responsive user experience while efficiently managing browser resources.