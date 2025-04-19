# Phase 4.2: Data Loading and Error States

This document analyzes the data loading patterns, loading states, skeletons, error handling, and caching mechanisms used in Metabase's visualization system.

## 1. Overview

Metabase's data loading and error handling system is designed to provide a responsive and informative user experience during the various states of data fetching for visualizations. The system handles:

- Initial loading states with skeleton UIs and loading spinners
- Error states with appropriate error messages
- Slow query detection and messaging
- Data caching and optimization to improve performance

The primary components and files responsible for data loading and error handling are:

- `Visualization.tsx`: The main visualization component that coordinates loading states
- `LoadingView.tsx`: Displays loading spinners and "slow query" indicators
- `ErrorView.tsx`: Displays error messages with appropriate styling
- `VisualizationSkeleton`: Provides placeholder UI during data loading
- `data-fetching.ts`: Contains core data fetching logic for dashboard cards
- `ChartRenderingErrorBoundary`: Catches rendering errors in visualizations
- `LoadingAndErrorWrapper`: General-purpose loading and error wrapper

## 2. Data Fetching Patterns

### 2.1 Dashboard Card Data Fetching

The primary data fetching flow for visualizations is managed in `dashboard/actions/data-fetching.ts`, which contains several key operations:

#### Core Functions

1. `fetchCardData`: Fetches data for an individual card
   ```typescript
   export const fetchCardData = (
     card: Card,
     dashcard: DashboardCard,
     options: { clearCache?: boolean, ignoreCache?: boolean, reload?: boolean } = {}
   ) => async (dispatch: Dispatch) => {
     await dispatch(
       fetchCardDataAction({
         card,
         dashcard,
         options,
       }),
     );
   };
   ```

2. `fetchDashboardCardData`: Orchestrates loading all cards in a dashboard
   ```typescript
   export const fetchDashboardCardData = (
     { isRefreshing = false, reload = false, clearCache = false } = {}
   ) => (dispatch: Dispatch, getState: GetState) => {
     // Determine which cards need to be fetched
     // Track loading state
     // Fetch data for all cards
   };
   ```

#### Loading Process

The data loading process follows these steps:

1. Determine which cards need to be fetched (all or only those not currently loading)
2. Update loading state with `fetchDashboardCardDataAction`
3. For each card, dispatch `fetchCardData` action
4. Apply parameters and fetch data from the appropriate API based on dashboard type
5. Track loading progress and update UI accordingly
6. Dispatch `loadingComplete` when all data is loaded

#### Dashboard Types

Different API endpoints are used depending on the dashboard type:
- Regular dashboards: `DashboardApi.cardQuery`
- Public dashboards: `PublicApi.dashboardCardQuery`
- Embedded dashboards: `EmbedApi.dashboardCardQuery`
- Transient/inline dashboards: `MetabaseApi.dataset`

### 2.2 Loading State Management

Loading state is tracked using the `isLoading` function in `Visualization.tsx`:

```typescript
const isLoading = (series: Series | null) => {
  return !(
    series &&
    series.length > 0 &&
    _.every(
      series,
      (s) => !!s.data || _.isObject(s.card.visualization_settings.virtual_card),
    )
  );
};
```

This function determines if data is still loading by checking if all series in the visualization have their data loaded.

### 2.3 Caching Mechanism

The data fetching system implements a caching mechanism to avoid redundant queries:

1. **Cache Checking**: Before fetching data, the system checks if there are already results with the same query parameters
   ```typescript
   if (!reload && lastResult && equals(
     getDatasetQueryParams(lastResult.json_query),
     getDatasetQueryParams(datasetQuery)
   )) {
     return { dashcard_id: dashcard.id, card_id: card.id, result: lastResult };
   }
   ```

2. **Cache Control Options**:
   - `clearCache`: Clears existing cache before loading
   - `ignoreCache`: Forces refresh from the data source
   - `reload`: Forces a reload even if parameters haven't changed

3. **Parameter Change Detection**: Cache is automatically cleared when parameters change
   ```typescript
   const hasParametersChanged = !lastResult || !equals(
     getDatasetQueryParams(lastResult.json_query).parameters,
     getDatasetQueryParams(datasetQuery).parameters
   );
   ```

## 3. Loading States and Skeletons

### 3.1 Loading Indicators

The `LoadingView` component displays loading states with appropriate feedback:

```typescript
function LoadingView({ expectedDuration, isSlow }: LoadingViewProps) {
  return (
    <Root>
      {isSlow ? (
        <SlowQueryView expectedDuration={expectedDuration} isSlow={isSlow} />
      ) : (
        <StyledLoadingSpinner />
      )}
    </Root>
  );
}
```

It handles two main states:
- **Normal loading**: Shows a spinning loader
- **Slow query**: Shows a message with the expected duration

### 3.2 Slow Query Detection

The system implements slow query detection to provide feedback for long-running queries:

```typescript
// Start a timer that will show the expected card duration if the query takes too long
const slowCardTimer = setTimeout(() => {
  if (result === null) {
    dispatch(markCardAsSlow(card));
  }
}, DASHBOARD_SLOW_TIMEOUT);
```

When a query exceeds the `DASHBOARD_SLOW_TIMEOUT` threshold (defined in `dashboard/constants.js`), it triggers a "slow query" state and shows appropriate messaging to users.

### 3.3 Skeleton Components

The `VisualizationSkeleton` component provides placeholder UI during data loading:

```typescript
export const VisualizationSkeleton = ({
  name,
  description,
  actionMenu,
  children,
  className,
}: VisualizationSkeletonProps) => {
  return (
    <VisualizationRoot className={className}>
      <VisualizationSkeletonCaption
        name={name}
        description={description}
        actionMenu={actionMenu}
      />
      {children}
    </VisualizationRoot>
  );
};
```

This component renders a placeholder frame with:
- Skeleton caption for title/description
- Slots for children (specific chart type skeletons)

Metabase includes specific skeleton implementations for different chart types (e.g., Bar, Line, Pie) in the `/visualizations/components/skeletons/` directory.

## 4. Error Handling

### 4.1 Error Boundaries

Metabase uses multiple layers of error boundaries to catch and handle errors:

1. **Component-level Error Boundary**: `Visualization` component has `componentDidCatch` to handle errors
   ```typescript
   componentDidCatch(error: Error, info: ErrorInfo) {
     console.error("Error caught in <Visualization>", error, info);
     this.setState({
       error: "An error occurred displaying this visualization.",
     });
   }
   ```

2. **Chart Rendering Error Boundary**: Dedicated component to catch rendering errors
   ```typescript
   export class ChartRenderingErrorBoundary extends Component<ChartRenderingErrorBoundaryProps> {
     componentDidCatch(error: any) {
       this.props.onRenderError(error.message || error);
     }
   
     render() {
       return this.props.children;
     }
   }
   ```

3. **Generic Error Boundary**: `ErrorBoundary` component wraps the entire visualization

### 4.2 Error Display

The `ErrorView` component displays error messages with appropriate styling:

```typescript
export function ErrorView({
  error,
  icon = "warning",
  isDashboard,
  isSmall,
}: ErrorViewProps) {
  return (
    <Root isDashboard={isDashboard}>
      <Tooltip label={error} disabled={!isSmall}>
        <StyledIcon name={icon} size={50} />
      </Tooltip>
      {!isSmall && <ShortMessage>{error}</ShortMessage>}
    </Root>
  );
}
```

Features include:
- Icon with error message tooltip
- Responsive design (compact for small cards)
- Dashboard-specific styling

### 4.3 Error Types and Handling

The visualization system handles different types of errors:

1. **API/Network Errors**: Caught during data fetching
2. **Rendering Errors**: Caught by error boundaries
3. **Chart Settings Errors**: Specialized handling for configuration issues
   ```typescript
   if (e instanceof ChartSettingsError && onOpenChartSettings) {
     error = (
       <ChartSettingsErrorButton
         message={error}
         buttonLabel={e.buttonText}
         onClick={() => onOpenChartSettings({ initialChartSettings: e.initial })}
       />
     );
   }
   ```
4. **Min Rows Errors**: When data is insufficient to render a visualization
   ```typescript
   if (e instanceof MinRowsError) {
     noResults = true;
   }
   ```

## 5. Refresh and Optimization Patterns

### 5.1 Dashboard Refreshing

The `use-refresh-dashboard.ts` hook provides functionality to refresh dashboard data:

```typescript
export const useRefreshDashboard = ({
  dashboardId,
  parameterQueryParams,
  refetchData = true,
}: {
  dashboardId: DashboardId | null;
  parameterQueryParams: Record<string, unknown>;
  refetchData?: boolean;
}): {
  refreshDashboard: () => Promise<void>;
} => {
  // Implementation for refreshing dashboard data
};
```

The refresh process:
1. Fetches the latest dashboard metadata
2. Optionally refetches all card data
3. Preserves current parameter values

### 5.2 Request Cancellation

The system implements request cancellation to avoid race conditions and wasted resources:

```typescript
// Machinery to support query cancellation
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

When a new request is made or navigation occurs, previous in-flight requests are cancelled.

### 5.3 Loading Status Indicators

The system provides visual feedback about loading progress:

```typescript
const updateLoadingTitle = createThunkAction(
  SET_DOCUMENT_TITLE,
  (totalCards) => (_dispatch, getState) => {
    const loadingDashCards = getLoadingDashCards(getState());
    const loadingComplete = totalCards - loadingDashCards.loadingIds.length;
    return `${loadingComplete}/${totalCards} loaded`;
  },
);
```

This updates the document title with loading progress and shows appropriate UI indicators.

## 6. Integration Points

### 6.1 Visualization Component Integration

The `Visualization` component integrates all loading and error states:

```typescript
render() {
  // ... (setup and prop extraction)
  
  return (
    <ErrorBoundary onError={this.onErrorBoundaryError} ref={this.props.forwardedRef}>
      <VisualizationRoot className={className} style={style}>
        {/* Header and content */}
        {replacementContent ? (
          replacementContent
        ) : isDashboard && noResults ? (
          <NoResultsView isSmall={small} />
        ) : error ? (
          <ErrorView error={errorMessageOverride ?? error} icon={errorIcon} isSmall={small} isDashboard={!!isDashboard} />
        ) : genericError ? (
          <SmallGenericError bordered={false} />
        ) : loading ? (
          <LoadingView expectedDuration={expectedDuration} isSlow={!!isSlow} />
        ) : isPlaceholder ? (
          <EmptyVizState chartType={visualization?.identifier} />
        ) : (
          series && (
            /* Actual visualization rendering */
          )
        )}
        {/* Tooltips and click actions */}
      </VisualizationRoot>
    </ErrorBoundary>
  );
}
```

The component uses a cascading if-else structure to display the appropriate view based on the current state (loading, error, empty results, or actual visualization).

### 6.2 Loading And Error Wrapper

The general-purpose `LoadingAndErrorWrapper` component provides consistent loading and error states across the application:

```typescript
return (
  <div className={className} style={style} data-testid={testId} ref={ref}>
    {error ? (
      renderError(contentClassName)
    ) : loading ? (
      <div className={contentClassName}>
        {showSpinner && <LoadingSpinner />}
        <h2 className={cx(CS.textNormal, CS.textLight, CS.mt1)}>
          {getLoadingMessages()[messageIndex]}
        </h2>
      </div>
    ) : (
      getChildren()
    )}
  </div>
);
```

This component is used in various places including the main Dashboard container.

## 7. Performance Considerations

### 7.1 Optimized Re-renders

The `Visualization` component uses several techniques to optimize rendering:

1. `PureComponent` to prevent unnecessary re-renders
2. Memoization through `memoizeClass`
3. Careful derivation of state through `getDerivedStateFromProps`
4. Selective updates based on changed props

### 7.2 Load Status Tracking

The system tracks loading status across all cards to provide aggregate loading information:

```typescript
const loadingComplete = createThunkAction(
  SET_LOADING_DASHCARDS_COMPLETE,
  () => (dispatch, getState) => {
    // Update UI to show loading is complete
    dispatch(setShowLoadingCompleteFavicon(true));
    // Reset document title
    // Show toast if needed
  },
);
```

## 8. Conclusion

Metabase's data loading and error handling system is comprehensive and provides a user-friendly experience during data fetching. The system uses a combination of loading indicators, skeleton UIs, error boundaries, and caching mechanisms to ensure visualizations load efficiently and errors are handled gracefully.

Key strengths of the system include:
- Multi-layered error handling
- Responsive loading states with slow query detection
- Efficient caching and request cancellation
- Clear user feedback during all stages of data loading
- Skeleton UIs that match the expected visualization

The system effectively manages the complex process of fetching and displaying data for multiple visualizations simultaneously in a dashboard context.