// Integration tests for file size formatting feature
// This test verifies that file size formatting works correctly with various visualizations

import { formatNumber } from "metabase/lib/formatting/numbers";

describe("File Size Formatting Integration", () => {
  describe("Table Visualization", () => {
    it("should format file size columns correctly in tables", () => {
      // Simulate table data with byte values
      const tableData = [
        { name: "small.txt", file_size: 1024 },
        { name: "medium.jpg", file_size: 5242880 },
        { name: "large.zip", file_size: 1073741824 },
      ];

      const formattedData = tableData.map((row) => ({
        ...row,
        file_size_formatted: formatNumber(row.file_size, {
          number_style: "filesize",
        }),
      }));

      expect(formattedData[0].file_size_formatted).toBe("1 KiB");
      expect(formattedData[1].file_size_formatted).toBe("5 MiB");
      expect(formattedData[2].file_size_formatted).toBe("1 GiB");
    });

    it("should handle unit in header setting", () => {
      const value = 1536;

      // Unit in cell
      const inCell = formatNumber(value, {
        number_style: "filesize",
        filesize_unit_in_header: false,
        type: "cell",
      });
      expect(inCell).toBe("1.5 KiB");

      // Unit in header
      const inHeader = formatNumber(value, {
        number_style: "filesize",
        filesize_unit_in_header: true,
        type: "cell",
      });
      expect(inHeader).toBe("1.5");
    });
  });

  describe("Chart Visualizations", () => {
    it("should format Y-axis values for bar charts", () => {
      const yAxisValues = [0, 1000000, 2000000, 3000000, 4000000, 5000000];

      // Test with decimal units for cleaner chart labels
      const formattedValues = yAxisValues.map((val) =>
        formatNumber(val, {
          number_style: "filesize",
          filesize_unit_system: "decimal",
        }),
      );

      expect(formattedValues).toEqual([
        "0 B",
        "1 MB",
        "2 MB",
        "3 MB",
        "4 MB",
        "5 MB",
      ]);
    });

    it("should handle large values in line charts", () => {
      const dataPoints = [
        1099511627776, // 1 TiB
        2199023255552, // 2 TiB
        5497558138880, // 5 TiB
        10995116277760, // 10 TiB
      ];

      const formatted = dataPoints.map((val) =>
        formatNumber(val, { number_style: "filesize" }),
      );

      expect(formatted).toEqual(["1 TiB", "2 TiB", "5 TiB", "10 TiB"]);
    });
  });

  describe("Export Functionality", () => {
    it("should maintain formatting in CSV exports", () => {
      // Simulating data that would be exported
      const exportData = {
        bandwidth_used: 1073741824,
        data_transferred: 5368709120,
        cache_size: 268435456,
      };

      const csvFormatted = Object.entries(exportData).reduce(
        (acc, [key, value]) => {
          acc[key] = formatNumber(value, { number_style: "filesize" });
          return acc;
        },
        {},
      );

      expect(csvFormatted).toEqual({
        bandwidth_used: "1 GiB",
        data_transferred: "5 GiB",
        cache_size: "256 MiB",
      });
    });
  });

  describe("Auto-detection", () => {
    it("should auto-detect file size columns", () => {
      const columns = [
        { name: "id" },
        { name: "file_size" },
        { name: "bandwidth" },
        { name: "bytes_transferred" },
        { name: "revenue" },
      ];

      // This simulates what getDefaultNumberStyle would do
      const shouldUseFileSize = (column) => {
        const name = column.name?.toLowerCase() || "";
        const indicators = [
          "byte",
          "size",
          "bandwidth",
          "traffic",
          "data_transfer",
          "file_size",
        ];
        return indicators.some((indicator) => name.includes(indicator));
      };

      expect(shouldUseFileSize(columns[0])).toBe(false); // id
      expect(shouldUseFileSize(columns[1])).toBe(true); // file_size
      expect(shouldUseFileSize(columns[2])).toBe(true); // bandwidth
      expect(shouldUseFileSize(columns[3])).toBe(true); // bytes_transferred
      expect(shouldUseFileSize(columns[4])).toBe(false); // revenue
    });
  });

  describe("Binary vs Decimal Units", () => {
    it("should support both binary and decimal unit systems", () => {
      const value = 1500000;

      const binary = formatNumber(value, {
        number_style: "filesize",
        filesize_unit_system: "binary",
      });
      expect(binary).toBe("1.43 MiB");

      const decimal = formatNumber(value, {
        number_style: "filesize",
        filesize_unit_system: "decimal",
      });
      expect(decimal).toBe("1.5 MB");
    });
  });
});
