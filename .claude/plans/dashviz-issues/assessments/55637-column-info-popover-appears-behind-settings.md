# Issue #55637: Column info popover appears behind the column settings popover

**URL**: https://github.com/metabase/metabase/issues/55637  
**Priority**: P3  
**Type**: Bug  
**Reporter**: timzu  
**Updated**: April 1, 2025

## Difficulty Score: 2/10

## Issue Description
When a user clicks on a column header to access the column settings popover, the column info popover also appears behind it, creating a confusing user experience where two popovers are displayed simultaneously.

## Technical Complexity

### Core Components Involved
1. **Table Interactive Component**
   - `TableInteractive.tsx` - Main table visualization component
   - `HeaderCellWithColumnInfo.tsx` - Column header cell that includes info popover

2. **Column Info Popover**
   - `QueryColumnInfoPopover` - Component that displays column metadata
   - The popover's display logic, trigger mechanism, and delay settings

### Implementation Analysis
Looking at the code, we can see that the issue is in the `HeaderCellWithColumnInfo` component. This component wraps the column header content with a `QueryColumnInfoPopover` component which displays information about the column when hovered. This popover has a 500ms delay before it appears, as seen in this code:

```typescript
<QueryColumnInfoPopover
  position="bottom-start"
  query={query}
  stageIndex={-1}
  column={query && Lib.fromLegacyColumn(query, stageIndex, column)}
  timezone={timezone}
  disabled={isMousePressed}
  openDelay={500}
  showFingerprintInfo
>
  {cellContent}
</QueryColumnInfoPopover>
```

The popover is disabled when `isMousePressed` is true, which is determined by the `useMousePressed` hook. However, when clicking on a column header to open the column settings, the info popover's timer has already started, and it still appears even though the settings popover is now open.

The bug occurs because the `isMousePressed` state doesn't properly account for the opening of the column settings popover. The info popover and settings popover aren't aware of each other's state.

### Resolution Factors

**Localization Considerations**: None - This is a purely UI interaction issue with no text changes needed.

**Testing Requirements**: Low - Simple manual testing to verify the info popover doesn't appear when the settings popover is active.

**Fix Complexity**: Low - The fix requires modifying how the info popover's display is controlled, potentially by:
1. Adding a prop to disable the info popover when the settings popover is open
2. Increasing the `openDelay` for the info popover
3. Adding logic to cancel the info popover when the settings popover is triggered

## Overall Assessment
This is a simple UI/UX bug that creates a confusing experience for users. The two popovers appearing at the same time is visually cluttered and makes it harder to focus on the settings.

The solution is straightforward: ensure that when a user is interacting with column settings, the info popover doesn't appear. This could be done by adding state to track when the settings popover is open and using that to disable the info popover.

The most elegant solution would likely be to:
1. Add a shared state to track when the column settings popover is open
2. Pass this state to the `HeaderCellWithColumnInfo` component
3. Use this state to conditionally disable the info popover

This should be a relatively simple fix that improves the user experience without requiring significant code changes.

Estimated time to fix: 1-2 hours, including testing.