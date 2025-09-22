# ExtendedDateFilterPicker

A custom date filter component designed for business use cases that need to filter by quarters/periods and select date ranges within a 3-month calendar view.

## Features

- **Quarter Selection**: Dropdown to select quarters (Q1-Q4) for current and adjacent years
- **Quick Period Buttons**: Today, Yesterday, WTD, PTD, QTD, YTD shortcuts
- **3-Month Calendar View**: Shows all 3 months of the selected quarter simultaneously
- **Date Range Selection**: Click to select start and end dates within the quarter
- **Responsive Layout**: Grid layout that adapts to the content

## Usage

```tsx
import { ExtendedDateFilterPicker } from "metabase/querying/filters/components/DatePicker/ExtendedDateFilterPicker";
import type { ExtendedDatePickerValue } from "metabase/querying/filters/types";

function MyComponent() {
  const [dateFilter, setDateFilter] = useState<ExtendedDatePickerValue | undefined>();

  return (
    <ExtendedDateFilterPicker
      value={dateFilter}
      onChange={setDateFilter}
      onBack={() => console.log("Back clicked")}
      readOnly={false}
    />
  );
}
```

## Props

| Prop | Type | Description |
|------|------|-------------|
| `value` | `ExtendedDatePickerValue?` | Current filter value |
| `onChange` | `(value: ExtendedDatePickerValue) => void` | Called when filter changes |
| `onBack` | `() => void` | Optional back button handler |
| `readOnly` | `boolean` | Disable interactions (default: false) |

## Value Structure

```typescript
interface ExtendedDatePickerValue {
  type: "extended";
  quarter: {
    label: string;        // e.g., "Q2 2025"
    value: string;        // e.g., "2025-Q2"
    startDate: Date;      // Quarter start date
    endDate: Date;        // Quarter end date
  };
  dateRange?: {
    start: Date;          // Selected range start
    end: Date;            // Selected range end
  };
}
```

## Integration Tips

### As a Dashboard Filter
```tsx
// In a dashboard component
const handleDateFilterChange = (value: ExtendedDatePickerValue) => {
  // Convert to your dashboard's filter format
  const filter = {
    column: "created_at",
    operator: "between",
    values: value.dateRange ? [value.dateRange.start, value.dateRange.end] : [value.quarter.startDate, value.quarter.endDate]
  };
  
  updateDashboardFilter(filter);
};
```

### With Existing Filter System
```tsx
// Convert to Metabase's standard date filter format
const convertToMetabaseFilter = (value: ExtendedDatePickerValue): SpecificDatePickerValue => {
  const range = value.dateRange || { start: value.quarter.startDate, end: value.quarter.endDate };
  
  return {
    type: "specific",
    operator: "between",
    values: [range.start, range.end],
    hasTime: false
  };
};
```

## Styling

The component uses CSS modules for styling. Key CSS custom properties:

```css
:root {
  --mb-color-brand: #509ee3;          /* Primary brand color */
  --mb-color-brand-light: #e6f2ff;    /* Light brand background */
  --mb-color-brand-dark: #2c5aa0;     /* Dark brand hover */
  --mb-color-bg-white: #ffffff;       /* White background */
  --mb-color-bg-light: #f9fbfc;       /* Light background */
  --mb-color-bg-medium: #eef2f5;      /* Medium background */
  --mb-color-border: #dce1e4;         /* Border color */
  --mb-color-text-dark: #2e353b;      /* Dark text */
  --mb-color-text-medium: #7c8381;    /* Medium text */
  --mb-color-text-light: #b8bbc0;     /* Light text */
}
```

## Development

To test the component:

1. **Storybook**: `yarn storybook` and navigate to Components/ExtendedDateFilterPicker
2. **Local Development**: Import and use in your dashboard components
3. **Type Safety**: All types are exported from the main types file

## Fork-Friendly Design

This component is designed to be:
- **Standalone**: No modifications to existing Metabase core files
- **Additive**: Only adds new functionality, doesn't change existing behavior
- **Self-contained**: All logic and styling in its own directory
- **Type-safe**: Follows Metabase's type system patterns

This makes it easy to:
- Merge upstream Metabase changes
- Maintain the component independently
- Migrate to official Metabase features if they're added later