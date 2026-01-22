---
name: analytics-events
description: Add product analytics events to track user interactions in the Metabase frontend
allowed-tools: Read, Write, Edit, Grep, Glob
---

# Frontend Analytics Events Skill

This skill helps you add product analytics (Snowplow) events to track user interactions in the Metabase frontend codebase.

## Quick Reference

Analytics events in Metabase use Snowplow with typed event schemas. All events must be defined in TypeScript types before use.

**Key Files:**
- `frontend/src/metabase-types/analytics/event.ts` - Event type definitions
- `frontend/src/metabase-types/analytics/schema.ts` - Schema registry
- `frontend/src/metabase/lib/analytics.ts` - Core tracking functions
- Feature-specific `analytics.ts` files - Tracking function wrappers

## Quick Checklist

When adding a new analytics event:

- [ ] Define event type in `frontend/src/metabase-types/analytics/event.ts`
- [ ] Add event to appropriate union type (e.g., `DataStudioEvent`, `SimpleEvent`)
- [ ] Create tracking function in feature's `analytics.ts` file
- [ ] Import and call tracking function at the interaction point
- [ ] Use `trackSimpleEvent()` for basic events (most common)

## Event Schema Types

### 1. Simple Events (Most Common)

Use `SimpleEventSchema` for straightforward tracking. It supports these standard fields:

```typescript
type SimpleEventSchema = {
  event: string;                    // Required: Event name (snake_case)
  target_id?: number | null;        // Optional: ID of affected entity
  triggered_from?: string | null;   // Optional: UI location/context
  duration_ms?: number | null;      // Optional: Duration in milliseconds
  result?: string | null;           // Optional: Outcome (e.g., "success", "failure")
  event_detail?: string | null;     // Optional: Additional detail/variant
};
```

**When to use:** 90% of events fit this schema. Use for clicks, opens, closes, creates, deletes, etc.

### 2. Custom Schemas (legacy, no events are being added)

Consider adding new event schema only in very special cases.

**Examples:** `DashboardEventSchema`, `CleanupEventSchema`, `QuestionEventSchema`

## Step-by-Step: Adding a Simple Event

### Example: Track when a user applies filters in a table picker

#### Step 1: Define Event Types

Add event type definitions to `frontend/src/metabase-types/analytics/event.ts`:

```typescript
export type DataStudioTablePickerFiltersAppliedEvent = ValidateEvent<{
  event: "data_studio_table_picker_filters_applied";
}>;

export type DataStudioTablePickerFiltersClearedEvent = ValidateEvent<{
  event: "data_studio_table_picker_filters_cleared";
}>;
```

#### Step 2: Add to Union Type

Find or create the appropriate union type and add your events:

```typescript
export type DataStudioEvent =
  | DataStudioLibraryCreatedEvent
  | DataStudioTablePublishedEvent
  | DataStudioGlossaryCreatedEvent
  | DataStudioGlossaryEditedEvent
  | DataStudioGlossaryDeletedEvent
  | DataStudioTablePickerFiltersAppliedEvent  // <- Add here
  | DataStudioTablePickerFiltersClearedEvent; // <- Add here
```

#### Step 3: Create Tracking Functions

In your feature's `analytics.ts` file (e.g., `enterprise/frontend/src/metabase-enterprise/data-studio/analytics.ts`):

```typescript
import { trackSimpleEvent } from "metabase/lib/analytics";

export const trackDataStudioTablePickerFiltersApplied = () => {
  trackSimpleEvent({
    event: "data_studio_table_picker_filters_applied",
  });
};

export const trackDataStudioTablePickerFiltersCleared = () => {
  trackSimpleEvent({
    event: "data_studio_table_picker_filters_cleared",
  });
};
```

#### Step 4: Use in Components

Import and call the tracking function at the interaction point:

```typescript
import {
  trackDataStudioTablePickerFiltersApplied,
  trackDataStudioTablePickerFiltersCleared,
} from "metabase-enterprise/data-studio/analytics";

function FilterPopover({ filters, onSubmit }) {
  const handleReset = () => {
    trackDataStudioTablePickerFiltersCleared(); // <- Track here
    onSubmit(emptyFilters);
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        trackDataStudioTablePickerFiltersApplied(); // <- Track here
        onSubmit(form);
      }}
    >
      {/* form content */}
    </form>
  );
}
```

## Using SimpleEventSchema Fields

### Example: Event with target_id

```typescript
// Type definition
export type DataStudioLibraryCreatedEvent = ValidateEvent<{
  event: "data_studio_library_created";
  target_id: number | null;
}>;

// Tracking function
export const trackDataStudioLibraryCreated = (id: CollectionId) => {
  trackSimpleEvent({
    event: "data_studio_library_created",
    target_id: Number(id),
  });
};

// Usage
trackDataStudioLibraryCreated(newLibrary.id);
```

### Example: Event with triggered_from

```typescript
// Type definition
export type NewButtonClickedEvent = ValidateEvent<{
  event: "new_button_clicked";
  triggered_from: "app-bar" | "empty-collection";
}>;

// Tracking function
export const trackNewButtonClicked = (location: "app-bar" | "empty-collection") => {
  trackSimpleEvent({
    event: "new_button_clicked",
    triggered_from: location,
  });
};

// Usage
<Button onClick={() => {
  trackNewButtonClicked("app-bar");
  handleCreate();
}}>
  New
</Button>
```

### Example: Event with event_detail

```typescript
// Type definition
export type MetadataEditEvent = ValidateEvent<{
  event: "metadata_edited";
  event_detail: "type_casting" | "semantic_type_change" | "visibility_change";
  triggered_from: "admin" | "data_studio";
}>;

// Tracking function
export const trackMetadataChange = (
  detail: "type_casting" | "semantic_type_change" | "visibility_change",
  location: "admin" | "data_studio"
) => {
  trackSimpleEvent({
    event: "metadata_edited",
    event_detail: detail,
    triggered_from: location,
  });
};

// Usage
trackMetadataChange("semantic_type_change", "data_studio");
```

### Example: Event with result and duration

```typescript
// Type definition
export type MoveToTrashEvent = ValidateEvent<{
  event: "moved-to-trash";
  target_id: number | null;
  triggered_from: "collection" | "detail_page" | "cleanup_modal";
  duration_ms: number | null;
  result: "success" | "failure";
  event_detail: "question" | "model" | "metric" | "dashboard";
}>;

// Tracking function
export const trackMoveToTrash = (params: {
  targetId: number | null;
  triggeredFrom: "collection" | "detail_page" | "cleanup_modal";
  durationMs: number | null;
  result: "success" | "failure";
  itemType: "question" | "model" | "metric" | "dashboard";
}) => {
  trackSimpleEvent({
    event: "moved-to-trash",
    target_id: params.targetId,
    triggered_from: params.triggeredFrom,
    duration_ms: params.durationMs,
    result: params.result,
    event_detail: params.itemType,
  });
};

// Usage with timing
const startTime = Date.now();
try {
  await moveToTrash(item);
  trackMoveToTrash({
    targetId: item.id,
    triggeredFrom: "collection",
    durationMs: Date.now() - startTime,
    result: "success",
    itemType: "question",
  });
} catch (error) {
  trackMoveToTrash({
    targetId: item.id,
    triggeredFrom: "collection",
    durationMs: Date.now() - startTime,
    result: "failure",
    itemType: "question",
  });
}
```

## Naming Conventions

### Event Names (snake_case)

```typescript
// Good
"data_studio_library_created"
"table_picker_filters_applied"
"metabot_chat_opened"

// Bad
"DataStudioLibraryCreated"  // Wrong case
"tablePickerFiltersApplied" // Wrong case
"filters-applied"            // Use underscore, not hyphen
```

### Event Type Names (PascalCase with "Event" suffix)

```typescript
// Good
DataStudioLibraryCreatedEvent
TablePickerFiltersAppliedEvent
MetabotChatOpenedEvent

// Bad
dataStudioLibraryCreated      // Wrong case
DataStudioLibraryCreated      // Missing "Event" suffix
```

### Tracking Function Names (camelCase with "track" prefix)

```typescript
// Good
trackDataStudioLibraryCreated
trackTablePickerFiltersApplied
trackMetabotChatOpened

// Bad
DataStudioLibraryCreated      // Missing "track" prefix
track_library_created         // Wrong case
logLibraryCreated             // Use "track" prefix
```

## Common Patterns

### Pattern 1: Feature-Specific Union Types

Group related events together:

```typescript
export type DataStudioEvent =
  | DataStudioLibraryCreatedEvent
  | DataStudioTablePublishedEvent
  | DataStudioGlossaryCreatedEvent;

export type MetabotEvent =
  | MetabotChatOpenedEvent
  | MetabotRequestSentEvent
  | MetabotFixQueryClickedEvent;

// Then add to SimpleEvent union
export type SimpleEvent =
  | /* other events */
  | DataStudioEvent
  | MetabotEvent
  | /* more events */;
```

### Pattern 2: Conditional Tracking

Track different events based on user action:

```typescript
const handleSave = async () => {
  if (isNewItem) {
    await createItem(data);
    trackItemCreated(newItem.id);
  } else {
    await updateItem(id, data);
    trackItemUpdated(id);
  }
};
```

## Common Pitfalls

### Don't: Add custom fields to SimpleEvent

```typescript
// WRONG - SimpleEvent doesn't support custom fields
export const trackFiltersApplied = (filters: FilterState) => {
  trackSimpleEvent({
    event: "filters_applied",
    data_layer: filters.dataLayer,      // ❌ Not in SimpleEventSchema
    data_source: filters.dataSource,    // ❌ Not in SimpleEventSchema
    with_owner: filters.hasOwner,       // ❌ Not in SimpleEventSchema
  });
};

// RIGHT - Use only standard SimpleEventSchema fields
export const trackFiltersApplied = () => {
  trackSimpleEvent({
    event: "filters_applied",
  });
};

// Or use event_detail for a single variant
export const trackFilterApplied = (filterType: string) => {
  trackSimpleEvent({
    event: "filter_applied",
    event_detail: filterType,  // ✓ "data_layer", "data_source", etc.
  });
};
```

### Don't: Forget to add event to union type

```typescript
// Define the event
export type NewFeatureClickedEvent = ValidateEvent<{
  event: "new_feature_clicked";
}>;

// ❌ WRONG - Forgot to add to SimpleEvent union
// Event won't be recognized by TypeScript

// ✓ RIGHT - Add to appropriate union
export type SimpleEvent =
  | /* other events */
  | NewFeatureClickedEvent;
```

### Don't: Mix up event name formats

```typescript
// WRONG
event: "dataStudioLibraryCreated"  // camelCase
event: "data-studio-library-created"  // kebab-case
event: "Data_Studio_Library_Created"  // Mixed case

// RIGHT
event: "data_studio_library_created"  // snake_case
```

### Don't: Track PII or sensitive data

```typescript
// WRONG - Don't track user emails, names, or sensitive data
trackSimpleEvent({
  event: "user_logged_in",
  event_detail: user.email,  // ❌ PII
});

// RIGHT - Track non-sensitive identifiers only
trackSimpleEvent({
  event: "user_logged_in",
  target_id: user.id,  // ✓ Just the ID
});
```

### Don't: Forget to track both success and failure

```typescript
// WRONG - Only tracking success
try {
  await saveData();
  trackDataSaved();
} catch (error) {
  // ❌ No tracking for failure case
}

// RIGHT - Track both outcomes
try {
  await saveData();
  trackDataSaved({ result: "success" });
} catch (error) {
  trackDataSaved({ result: "failure" });
}
```

## Testing Analytics Events

While developing, you can verify events are firing:

1. **Check browser console** - When `SNOWPLOW_ENABLED=true` in dev, events are logged
2. **Use shouldLogAnalytics** - Set in `metabase/env` to see all analytics in console
3. **Check Snowplow debugger** - Browser extension for Snowplow events

Example console output:

```
[SNOWPLOW EVENT | event sent:true], data_studio_table_picker_filters_applied
```

## File Organization

### Where to put tracking functions:

```
Feature-specific analytics functions:
frontend/src/metabase/{feature}/analytics.ts
enterprise/frontend/src/metabase-enterprise/{feature}/analytics.ts

Event type definitions (all in one place):
frontend/src/metabase-types/analytics/event.ts

Core tracking utilities:
frontend/src/metabase/lib/analytics.ts
```

## Real-World Examples

See these files for reference:

- **Simple events**: `enterprise/frontend/src/metabase-enterprise/data-studio/analytics.ts`
- **Events with variants**: `frontend/src/metabase/dashboard/analytics.ts`
- **Complex events**: `frontend/src/metabase/query_builder/analytics.js`
- **Event type examples**: `frontend/src/metabase-types/analytics/event.ts`

## Workflow Summary

1. **Identify the user interaction** to track
2. **Decide on event name** (snake_case, descriptive)
3. **Define event type** in `event.ts` using `ValidateEvent`
4. **Add to union type** (create feature union if needed)
5. **Create tracking function** in feature's `analytics.ts`
6. **Import and call** at the interaction point
7. **Test** that events fire correctly

## Tips

- **Be specific** - `filters_applied` is better than `action_performed`
- **Use past tense** - `library_created` not `create_library`
- **Group related events** - Create feature-specific event union types
- **Track meaningful actions** - Not every click needs tracking
- **Consider the data** - What would you want to analyze later?
- **Stay consistent** - Follow existing naming patterns in the codebase
- **Document context** - Use `triggered_from` to track where the action happened
