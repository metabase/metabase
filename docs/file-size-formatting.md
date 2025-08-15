# File Size Formatting

## Overview

Metabase now supports automatic file size formatting for numeric columns, converting raw byte values into human-readable units like KB, MB, GB, etc. This feature is particularly useful for displaying data related to file sizes, bandwidth usage, data transfers, and storage metrics.

## Features

### Supported Units

The file size formatter supports all standard units up to Petabytes:

**Binary Units (1024-based):**
- B (Bytes)
- KiB (Kibibytes) 
- MiB (Mebibytes)
- GiB (Gibibytes)
- TiB (Tebibytes)
- PiB (Pebibytes)

**Decimal Units (1000-based):**
- B (Bytes)
- KB (Kilobytes)
- MB (Megabytes)
- GB (Gigabytes)
- TB (Terabytes)
- PB (Petabytes)

### Auto-detection

Metabase automatically detects columns that likely contain byte values based on column names. Columns with names containing any of these keywords will default to file size formatting:
- `byte`
- `size`
- `bandwidth`
- `traffic`
- `data_transfer`
- `file_size`

## Usage

### Setting File Size Formatting

1. **In a Table Visualization:**
   - Click on the column settings (gear icon)
   - Under "Style", select "File size"
   - Choose your preferred unit system (Binary or Decimal)
   - Optionally configure where to display units

2. **In Charts:**
   - File size formatting automatically applies to Y-axis values
   - The formatter chooses the most appropriate unit based on the data range

### Configuration Options

When "File size" is selected as the number style, you can configure:

1. **Unit System**
   - **Binary (default)**: Uses 1024-based units (KiB, MiB, GiB)
   - **Decimal**: Uses 1000-based units (KB, MB, GB)

2. **Unit Display Location** (Tables only)
   - **In every table cell**: Shows units with each value (e.g., "1.5 MB")
   - **In the column heading**: Shows unit in header, values only in cells

3. **Decimal Places**
   - Control the number of decimal places displayed
   - Bytes are always shown as whole numbers

## Examples

### Example 1: Server Log Data

Given a table with bandwidth usage in bytes:

| Server | bandwidth_used |
|--------|---------------|
| web-01 | 1073741824    |
| web-02 | 5368709120    |
| api-01 | 268435456     |

With file size formatting (binary units):

| Server | Bandwidth Used |
|--------|---------------|
| web-01 | 1 GiB         |
| web-02 | 5 GiB         |
| api-01 | 256 MiB       |

### Example 2: File Storage Report

Original data in bytes:

| File Type | Total Size    |
|-----------|--------------|
| Images    | 52428800000  |
| Videos    | 1099511627776|
| Documents | 10737418240  |

With file size formatting (decimal units):

| File Type | Total Size |
|-----------|-----------|
| Images    | 52.43 GB  |
| Videos    | 1.10 TB   |
| Documents | 10.74 GB  |

## API Usage

### Frontend (JavaScript/TypeScript)

```javascript
import { formatNumber } from "metabase/lib/formatting/numbers";

// Basic usage with binary units (default)
formatNumber(1048576, { number_style: "filesize" }); 
// Returns: "1 MiB"

// Using decimal units
formatNumber(1000000, { 
  number_style: "filesize",
  filesize_unit_system: "decimal" 
}); 
// Returns: "1 MB"

// Controlling decimal places
formatNumber(1536000, { 
  number_style: "filesize",
  decimals: 1 
}); 
// Returns: "1.5 MiB"

// Unit in header mode (for tables)
formatNumber(1048576, { 
  number_style: "filesize",
  filesize_unit_in_header: true,
  type: "cell"
}); 
// Returns: "1" (unit shown in column header)
```

### Backend (Clojure)

```clojure
(require '[metabase.util.formatting.numbers :as numbers])

; Basic usage with binary units (default)
(numbers/format-number 1048576 {:number-style "filesize"})
; => "1 MiB"

; Using decimal units
(numbers/format-number 1000000 
  {:number-style "filesize" 
   :filesize-unit-system "decimal"})
; => "1 MB"

; With custom decimals
(numbers/format-number 1536000 
  {:number-style "filesize" 
   :decimals 1})
; => "1.5 MiB"
```

## Best Practices

1. **Choose the Right Unit System:**
   - Use **binary units** (KiB, MiB, GiB) for file sizes, memory, and storage
   - Use **decimal units** (KB, MB, GB) for network bandwidth and data transfer rates

2. **Column Naming:**
   - Use descriptive column names that include keywords like "bytes", "size", or "bandwidth" to enable auto-detection
   - Examples: `file_size_bytes`, `bandwidth_kbps`, `data_transferred`

3. **Decimal Places:**
   - Use 0-1 decimal places for cleaner presentation in dashboards
   - Use 2-3 decimal places when precision is important

4. **Large Datasets:**
   - File size formatting automatically scales to the most appropriate unit
   - No manual conversion needed even for petabyte-scale data

## Compatibility

- **Frontend**: Works with all modern browsers
- **Backend**: Compatible with both JVM and JavaScript (ClojureScript) environments
- **Exports**: File size formatting is preserved in CSV and Excel exports
- **Charts**: Supported in all chart types (bar, line, area, etc.)

## Migration Guide

If you have existing queries that manually convert bytes to larger units, you can simplify them:

**Before:**
```sql
SELECT 
  filename,
  ROUND(file_size / 1024.0 / 1024.0, 2) as "Size (MB)"
FROM files
```

**After:**
```sql
SELECT 
  filename,
  file_size as file_size_bytes
FROM files
```

Then apply file size formatting to the `file_size_bytes` column in Metabase.

## Troubleshooting

### Issue: Wrong unit system showing

**Solution**: Check the column settings and ensure the correct unit system (binary vs decimal) is selected.

### Issue: Too many decimal places

**Solution**: Adjust the "Decimals" setting in the column configuration to reduce precision.

### Issue: Auto-detection not working

**Solution**: Ensure your column name contains one of the detection keywords, or manually select "File size" in the Style dropdown.

## Related Documentation

- [Number Formatting](./number-formatting.md)
- [Column Settings](./column-settings.md)
- [Visualization Settings](./visualization-settings.md)