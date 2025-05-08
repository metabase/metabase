# Issue #54317: Object detail navigation state is not reset when query changes which may lead to an invalid state

**URL**: https://github.com/metabase/metabase/issues/54317  
**Priority**: P3  
**Type**: Bug  
**Reporter**: kamilmielnik  
**Updated**: March 25, 2025

## Difficulty Score: 3/10

## Issue Description
When using the Object Detail visualization, if a user changes the query filter to reduce the number of results, the navigation state doesn't get reset. This leads to an inconsistent state where the navigation shows an incorrect message like "Item 12 of 9" (showing a record number greater than the total record count).

## Technical Complexity

### Core Components Involved
1. **Object Detail Visualization**
   - `ObjectDetailView.tsx` - Main component for object detail visualization
   - Navigation state management in object detail components

2. **Query Result Management**
   - Query change handling in query builder
   - Object detail navigation state reset logic

### Implementation Analysis
The issue occurs because the object detail navigation state (current record index and total count) isn't updated when the query changes. This is particularly noticeable when filters are applied that reduce the number of results.

Looking at the code, we need to focus on how the query results and object detail state are connected. The `ObjectDetailView` component receives props like `canZoomNextRow` and `canZoomPreviousRow` that control navigation, but there's no logic to reset the zoomed record when the query changes.

When the query changes, the query processor runs and produces new results, but the object detail component doesn't check if the currently viewed record still exists in the new result set, nor does it reset to the first record.

The fix should be in the query builder's handling of query changes, where it should check if the object detail view is active and reset its state when a query change occurs.

### Resolution Factors

**Localization Considerations**: None - This is a purely logical fix with no text changes.

**Testing Requirements**: Medium - Need to test various query change scenarios with object detail visualization.

**Fix Complexity**: Low to Medium - The fix requires adding a check when query results change to determine if object detail state needs to be reset.

## Overall Assessment
This is a moderate difficulty bug involving the interaction between query changes and object detail visualization state. The issue creates a confusing user experience where navigation shows incorrect information.

The fix would likely involve:
1. Adding a check in the query processing flow that detects when a query has changed
2. If the object detail view is active, reset the object detail navigation state
3. Either redirect to the first result in the new set or close the object detail view entirely

The most elegant solution would be to:
1. In the query builder actions that handle query changes, add logic to check if object detail is active
2. If active, call the `resetRowZoom` action to reset the object detail state
3. Make sure this happens at the appropriate time in the query execution flow

This seems to be a straightforward fix that would significantly improve the user experience by ensuring the navigation state is always consistent with the actual query results.

Estimated time to fix: 2-3 hours, including testing various query change scenarios.