---
name: analytics-events
description: Add product analytics events to track user interactions in the Metabase frontend
allowed-tools: Read, Write, Edit, Grep, Glob
---

# Frontend Analytics Events Skill

This skill helps you add product analytics (Snowplow) events to track user interactions in the Metabase frontend codebase.

## Quick Reference

Analytics events in Metabase use Snowplow with typed event schemas. Simple events are declared **where they are used** — `trackSimpleEvent` is generic and validates the payload at the call site.

**Key Files:**
- `frontend/src/metabase/analytics/event.ts` - Core tracking functions, `trackSimpleEvent` / `trackSchemaEvent` (import from `metabase/analytics`)
- `frontend/src/metabase-types/analytics/event.ts` - The shared `SimpleEventSchema` only. **Do not add event types here** (see below)
- `frontend/src/metabase-types/analytics/schema.ts` - Schema registry (custom/legacy schemas only)
- Feature-specific `analytics.ts` files - Where your tracking functions and any local types live

## Quick Checklist

When adding a new analytics event:

- [ ] Pick an event name (snake_case, past tense)
- [ ] Add a tracking function to the feature's `analytics.ts` file, calling `trackSimpleEvent()`
- [ ] Keep any field unions (e.g. `"success" | "failure"`) as local types in that same file
- [ ] Import and call the tracking function at the interaction point
- [ ] Do **not** add an event type to `metabase-types/analytics/event.ts` or to any union

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

`trackSimpleEvent` is generic and enforces this schema on the object literal you pass it:

```typescript
// frontend/src/metabase/analytics/event.ts
export function trackSimpleEvent<
  T extends SimpleEventSchema &
    Record<Exclude<keyof T, keyof SimpleEventSchema>, never>,
>(event: T) {
  trackSchemaEvent("simple_event", event);
}
```

That means a missing `event` or any field outside `SimpleEventSchema` is a compile error at the call
site. There is no separate event type to declare and no `satisfies` clause to add — the old
`ValidateEvent<...>` helper is no longer exported and is not part of the workflow.

`trackSchemaEvent` is generic too: it correlates the schema name with the payload type, so you can't
send a dashboard event under the `simple_event` schema.

### 2. Custom Schemas (legacy, no events are being added)

Consider adding new event schema only in very special cases.

**Examples:** `DashboardEventSchema`, `CleanupEventSchema`, `QuestionEventSchema`

## Step-by-Step: Adding a Simple Event

### Example: Track when a user applies filters in a table picker

#### Step 1: Create Tracking Functions

In your feature's `analytics.ts` file (e.g., `enterprise/frontend/src/metabase-enterprise/data-studio/analytics.ts`):

```typescript
import { trackSimpleEvent } from "metabase/analytics";

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

#### Step 2: Use in Components

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

All examples below live in the feature's own `analytics.ts` — nothing is registered centrally.

### Example: Event with target_id

```typescript
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
// Local union, exported only if another feature needs to pass the same value
export type NewButtonLocation = "app-bar" | "empty-collection";

export const trackNewButtonClicked = (location: NewButtonLocation) => {
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

Real example — `frontend/src/metabase/metadata/pages/shared/analytics.ts`:

```typescript
export type MetadataEditEventDetail =
  | "type_casting"
  | "semantic_type_change"
  | "visibility_change";

export const trackMetadataChange = (detail: MetadataEditEventDetail) => {
  trackSimpleEvent({
    event: "metadata_edited",
    event_detail: detail,
    triggered_from: "admin",
  });
};

// Usage
trackMetadataChange("semantic_type_change");
```

### Example: Event with result and duration

See `frontend/src/metabase/archive/analytics.ts` for the real version of this.

```typescript
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

### Local Field Types (PascalCase, named after the field)

There is usually no `...Event` type to name anymore. When you do need a union for a field, name it
after the field it feeds:

```typescript
// Good
type MetricDimensionResult = "success" | "failure";     // -> result
export type MetadataEditEventDetail = "type_casting";   // -> event_detail
type NewButtonLocation = "app-bar" | "empty-collection"; // -> triggered_from
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

### Pattern 1: Sharing Field Types Across Features

When two features send the same event with a different `triggered_from`, export the field union from
the owning feature's `analytics.ts` and import it — don't hoist anything into `metabase-types`:

```typescript
// frontend/src/metabase/data-studio/data-model/analytics.ts
import { trackSimpleEvent } from "metabase/analytics";
import type { MetadataEditEventDetail } from "metabase/metadata/pages/shared/analytics";

export function trackMetadataChange(detail: MetadataEditEventDetail) {
  trackSimpleEvent({
    event: "metadata_edited",
    event_detail: detail,
    triggered_from: "data_studio",
  });
}
```

This is the point of the extensible-events design: enterprise and feature-tier types stay in their
own module instead of being imported down into a shared union.

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

### Don't: Add custom fields to a simple event

```typescript
// WRONG - SimpleEventSchema doesn't support custom fields (this is a compile error)
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

### Don't: Add event types to `metabase-types/analytics/event.ts`

The central `SimpleEvent` union was removed — it forced feature-tier types to be imported down into
shared code, causing module-boundary violations. `trackSimpleEvent` is generic now, so the type adds
nothing but duplication.

```typescript
// ❌ WRONG - central declaration + re-import for a `satisfies` clause
// frontend/src/metabase-types/analytics/event.ts
export type NewFeatureClickedEvent = ValidateEvent<{
  event: "new_feature_clicked";
  target_id: number;
}>;

// frontend/src/metabase/my-feature/analytics.ts
import type { NewFeatureClickedEvent } from "metabase-types/analytics";

export const trackNewFeatureClicked = (id: number) => {
  trackSimpleEvent({
    event: "new_feature_clicked",
    target_id: id,
  } satisfies NewFeatureClickedEvent);
};

// ✓ RIGHT - the object literal is already checked by the generic
// frontend/src/metabase/my-feature/analytics.ts
export const trackNewFeatureClicked = (id: number) => {
  trackSimpleEvent({
    event: "new_feature_clicked",
    target_id: id,
  });
};
```

A few `...Event` types still sit in `metabase-types/analytics/event.ts`. They are leftovers from PRs
that landed around the refactor — don't copy them, and don't add to them.

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
Tracking functions AND their local field types (this is where new events live):
frontend/src/metabase/{feature}/analytics.ts
enterprise/frontend/src/metabase-enterprise/{feature}/analytics.ts

Core tracking utilities:
frontend/src/metabase/analytics/ (import from `metabase/analytics`)

Shared SimpleEventSchema only — nothing new goes here:
frontend/src/metabase-types/analytics/event.ts
```

In embedding SDK code, use `trackSdkSimpleEvent`
(`frontend/src/embedding-sdk-bundle/analytics/snowplow.ts`) instead — the main-app `"sp"` tracker
isn't initialized in the customer's page, so `trackSimpleEvent`'s Snowplow leg is a no-op there.

## Real-World Examples

See these files for reference:

- **Simple events + local field union**: `frontend/src/metabase/metadata/pages/shared/analytics.ts`
- **Reusing another feature's field type**: `frontend/src/metabase/data-studio/data-model/analytics.ts`
- **Result + duration timing**: `frontend/src/metabase/archive/analytics.ts`
- **Enterprise feature events**: `enterprise/frontend/src/metabase-enterprise/google_drive/analytics.ts`

## Workflow Summary

1. **Identify the user interaction** to track
2. **Decide on event name** (snake_case, descriptive)
3. **Create tracking function** in feature's `analytics.ts`, calling `trackSimpleEvent()`
4. **Add local field unions** in that same file if a field has a fixed set of values
5. **Import and call** at the interaction point
6. **Test** that events fire correctly

## Tips

- **Be specific** - `filters_applied` is better than `action_performed`
- **Use past tense** - `library_created` not `create_library`
- **Group related events** - Keep a feature's tracking functions together in its `analytics.ts`
- **Track meaningful actions** - Not every click needs tracking
- **Consider the data** - What would you want to analyze later?
- **Stay consistent** - Follow existing naming patterns in the codebase
- **Document context** - Use `triggered_from` to track where the action happened
