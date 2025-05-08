# Issue #55487: Cannot navigate forwards to a Details modal in table view

**URL**: https://github.com/metabase/metabase/issues/55487  
**Priority**: P3  
**Type**: Bug  
**Reporter**: timzu  
**Updated**: April 4, 2025

## Difficulty Score: 4/10

## Issue Description
When viewing a table visualization, users can click on a row to see a detailed view of that record in a modal. If the user then clicks the browser's back button, the modal closes correctly. However, when they click the forward button, the URL updates to include the object ID, but the modal does not reappear as expected.

## Technical Complexity

### Core Components Involved
1. **Object Detail Navigation**
   - `popState` action in `navigation.ts` - Handles browser history navigation
   - `ObjectDetailView.tsx` - Modal component for displaying record details

2. **URL and State Management**
   - `updateUrl` action - Responsible for browser history updates
   - `zoomInRow` and `resetRowZoom` actions in `object-detail.ts`

### Implementation Analysis
The issue is in how browser history events are handled for object detail modals. Looking at the `popState` action in `navigation.ts`, we can see:

```javascript
export const popState = createThunkAction(
  POP_STATE,
  (location) => async (dispatch, getState) => {
    dispatch(cancelQuery());

    const zoomedObjectId = getZoomedObjectId(getState());
    if (zoomedObjectId) {
      const { state, query } = getLocation(getState());
      const previouslyZoomedObjectId = state?.objectId || query?.objectId;

      if (
        previouslyZoomedObjectId &&
        zoomedObjectId !== previouslyZoomedObjectId
      ) {
        dispatch(zoomInRow({ objectId: previouslyZoomedObjectId }));
      } else {
        dispatch(resetRowZoom());
      }
      return;
    }
    // ...rest of the function
  }
)
```

The issue appears to be that the `popState` action correctly handles going back (resetting the row zoom), but when navigating forward, the URL updates but the action to show the object detail modal isn't triggered properly.

The `locationChanged` function in `navigation.ts` handles location changes:

```javascript
export const locationChanged =
  (location: Location, nextLocation: Location, nextParams: QueryParams) =>
  (dispatch: Dispatch) => {
    if (location !== nextLocation) {
      if (nextLocation.action === "POP") {
        if (
          getURL(nextLocation, { includeMode: true }) !==
          getURL(location, { includeMode: true })
        ) {
          // the browser forward/back button was pressed
          dispatch(popState(nextLocation));
        }
      }
      // ... other cases
    }
  };
```

When navigating forward with the browser button, a POP action is dispatched. However, the `popState` function isn't correctly restoring the object detail view from the history state.

### Resolution Factors

**Localization Considerations**: None - This is a purely technical fix with no text changes.

**Testing Requirements**: Medium - Will need to test different browser navigation scenarios with object detail modals.

**Fix Complexity**: Medium - The fix requires modifying how browser history state is managed and restored for object details.

## Overall Assessment
This is a browser history navigation bug of moderate difficulty. The issue occurs because the application doesn't properly restore the object detail modal's state when navigating forward in the browser history.

The fix would involve:
1. Enhancing the `popState` action to correctly handle restoring the object detail modal when navigating forward
2. Ensuring that the history state contains all necessary information to restore the modal
3. Properly checking for the objectId in the URL or state during forward navigation

This is somewhat complex because it involves browser history state management, which has subtle edge cases, but it's not a fundamental architectural problem.

Estimated time to fix: 3-4 hours, including testing various browser navigation scenarios.