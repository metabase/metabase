# Export Functionality Analysis

## File Index
```
src/metabase/
├── query_processor/streaming/
│   ├── common.clj       # Shared utility functions for export formats
│   ├── csv.clj          # CSV export implementation
│   ├── xlsx.clj         # Excel export implementation
│   ├── json.clj         # JSON export implementation
│   └── interface.clj    # Protocol definitions
└── api/
    ├── dataset.clj      # Core dataset export endpoints
    ├── card.clj         # Card (saved question) export endpoints
    └── dashboard.clj    # Dashboard export endpoints
```

## Summary

Metabase's export functionality allows users to download query results in multiple formats (CSV, Excel, JSON). The architecture follows a streaming approach to handle large datasets efficiently. Export functionality is accessible through different endpoints for ad-hoc queries, saved questions (cards), and dashboards.

The system is designed to maintain visual formatting from the Metabase UI, including number formatting, date/time formatting, and currency display. The code handles special cases like pivot tables and provides hooks for enterprise extensions.

## Dependencies

### Upstream Dependencies
- Formatting utilities (`metabase.formatter`)
- Visualization settings (`metabase.models.visualization-settings`)
- Parameter handling (`metabase.query-processor.middleware.constraints`)
- Pivot table processing (`metabase.pivot.core`)
- Query processor core (`metabase.query-processor`)
- Database drivers (`metabase.driver`)

### Downstream Dependencies
- API endpoints in `metabase.api.dataset`, `metabase.api.card`, and `metabase.api.dashboard`
- Frontend components that provide export UI
- HTTP response handling for file downloads

## Key Data Structures

### StreamingResultsWriter
A protocol defined in the interface namespace that each export format implements, containing methods:
- `begin!` - Initializes the writer and writes headers
- `write-row!` - Writes a single row of data
- `finish!` - Finalizes the output and closes resources

### FormatValue Protocol
A protocol for formatting different data types in exports:
- Handles nil values, collections, date/time values
- Ensures consistent representation across export formats

### Visualization Settings
Structured data that controls how values are displayed:
- Number formatting (decimal places, currency symbols)
- Date/time formatting (date style, time style)
- Column titles and headers

## Core Functions

### Export Initialization
1. `qp.si/stream-options` - Configures HTTP response headers for each format
2. `streaming-common/export-filename-timestamp` - Generates consistent timestamps for filenames
3. `qp.si/streaming-results-writer` - Creates a format-specific writer

### Data Processing and Formatting
1. `streaming-common/format-value` - Converts database values to appropriate export format
2. `streaming-common/column-titles` - Generates column titles with formatting options
3. `streaming-common/viz-settings-for-col` - Retrieves visualization settings for a column
4. Format-specific cell writing (`write-csv`, `set-cell!`, etc.)

### API Endpoints
1. `dataset/:export-format` - General export endpoint for any query
2. `card/:card-id/query/:export-format` - Export saved question results
3. `dashboard/:dashboard-id/dashcard/:dashcard-id/card/:card-id/query/:export-format` - Export dashboard card results

## Configuration Points

### Export Format Settings
- CSV: Optional separators and quote handling
- Excel: Cell styling, number formatting, date/time formatting
- JSON: Structured output options (full API response vs. simple array)

### Visualization Settings
- Column-specific formatting through the `::mb.viz/column-settings` namespace
- Global formatting preferences in public settings
- Type-specific formatting (currency, dates, numbers)

### Pivot Table Support
- Special handling for pivoted data in export formats
- Option to enable/disable via `enable-pivoted-exports` setting

## Enterprise Extensions
While not explicitly defined in the open-source code, hooks exist for enterprise features:
- The `pivot?` flag in middleware options
- Permissions checking within export endpoints
- Sandboxing of data via parameter permissions
- Specialized formatting for enterprise features like currency

## Testing Approach
The testing strategy for export functionality includes:
- Unit tests for format-specific functions
- Integration tests for API endpoints
- Special test cases for edge cases like:
  - Large datasets (via streaming approach)
  - Special character handling
  - Formatting edge cases (currency, dates)
  - Pivot table exports

## Error Handling

### Common Error Scenarios
1. Permission checking before export operations
2. Validation of export format parameters
3. Handling of invalid visualization settings
4. Resource management (ensuring streams and files are closed)

### Specific Implementations
- Excel export caps cell content at 32,767 characters
- CSV handles special character escaping
- JSON handles serialization of complex objects
- All formats have error handling for unsupported data types

## Key Insights

1. **Streaming Architecture**: The export system uses a streaming approach rather than building the entire result in memory, allowing it to handle large datasets efficiently.

2. **Format Consistency**: There's significant effort to maintain visual formatting consistency between what users see in the UI and what they get in exports.

3. **Pivot Table Handling**: Special processing for pivot tables ensures they export correctly, with options to export in pivoted or flat formats.

4. **Performance Optimizations**: Several performance optimizations exist, such as:
   - Memoization of format functions
   - Custom CSV writing for better performance
   - Efficient cell style handling in Excel exports
   - Batched processing of data rows

5. **Integration Points**: The export functionality is accessible from multiple entry points:
   - Direct query exports
   - Saved question (card) exports
   - Dashboard card exports
   - Each supporting parameters and formatting options