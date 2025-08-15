import { formatNumber, numberFormatterForOptions } from "./numbers";

describe("formatNumber", () => {
  it("should respect the decimals setting even when compact is true (metabase#54063)", () => {
    const result = formatNumber(4.271250189320243, {
      compact: true,
      decimals: 0,
    });

    expect(result).toEqual("4");
  });

  it("should show the correct currency format (metabase#34242)", () => {
    const numberFormatter = numberFormatterForOptions({
      number_style: "currency",
      currency: "USD",
      currency_style: "symbol",
      maximumFractionDigits: 2,
    });

    const compactResult = formatNumber(-500000, {
      currency: "USD",
      number_style: "currency",
      currency_style: "symbol",
      currency_in_header: true,
      number_separators: ".,",
      _numberFormatter: numberFormatter,
      compact: true,
    });
    expect(compactResult).toEqual("-$500.0k");

    const fullResult = formatNumber(-500000, {
      compact: false,
      maximumFractionDigits: 2,
      currency: "USD",
      number_style: "currency",
      currency_style: "symbol",
      currency_in_header: true,
      number_separators: ".,",
      _numberFormatter: numberFormatter,
    });
    expect(fullResult).toEqual("-$500,000.00");
  });

  it("should work with scientific notation (metabase#25222)", () => {
    expect(
      formatNumber(0.000000000015, {
        number_style: "scientific",
      }),
    ).toEqual("1.5e-11");

    expect(
      formatNumber(1.000000015, {
        number_style: "scientific",
      }),
    ).toEqual("1.000000015e+0");

    expect(
      formatNumber(1.000015, {
        number_style: "scientific",
      }),
    ).toEqual("1.000015e+0");
  });
});

describe("formatNumber with scale (multiply function)", () => {
  it("should multiply regular numbers with scale", () => {
    expect(formatNumber(5, { scale: 3 })).toBe("15");
    expect(formatNumber(2.5, { scale: 4 })).toBe("10");
  });

  it("should multiply bigint with integer scale", () => {
    expect(formatNumber(BigInt(5), { scale: 3 })).toBe("15");
    expect(formatNumber(BigInt(100), { scale: 7 })).toBe("700");
  });

  it("should convert bigint to number when scaling with float", () => {
    expect(formatNumber(BigInt(5), { scale: 2.5 })).toBe("12.5");
    expect(formatNumber(BigInt(10), { scale: 1.5 })).toBe("15");
  });

  it("should handle edge cases with scale", () => {
    expect(formatNumber(0, { scale: 5 })).toBe("0");
    expect(formatNumber(BigInt(0), { scale: 3 })).toBe("0");
    expect(formatNumber(BigInt(5), { scale: 0 })).toBe("0");
    expect(formatNumber(BigInt(5), { scale: 0.5 })).toBe("2.5");
  });

  it("should handle negative numbers with scale", () => {
    expect(formatNumber(-5, { scale: 3 })).toBe("-15");
    expect(formatNumber(BigInt(-5), { scale: 3 })).toBe("-15");
    expect(formatNumber(BigInt(-5), { scale: 2.5 })).toBe("-12.5");
  });
});

describe("formatNumber with file size", () => {
  describe("binary units (default)", () => {
    it("should format bytes correctly", () => {
      expect(formatNumber(0, { number_style: "filesize" })).toBe("0 B");
      expect(formatNumber(512, { number_style: "filesize" })).toBe("512 B");
      expect(formatNumber(1023, { number_style: "filesize" })).toBe("1023 B");
    });
    
    it("should format KiB correctly", () => {
      expect(formatNumber(1024, { number_style: "filesize" })).toBe("1 KiB");
      expect(formatNumber(1536, { number_style: "filesize" })).toBe("1.5 KiB");
      expect(formatNumber(1048575, { number_style: "filesize" })).toBe("1024 KiB");
    });
    
    it("should format MiB correctly", () => {
      expect(formatNumber(1048576, { number_style: "filesize" })).toBe("1 MiB");
      expect(formatNumber(1572864, { number_style: "filesize" })).toBe("1.5 MiB");
    });
    
    it("should format GiB correctly", () => {
      expect(formatNumber(1073741824, { number_style: "filesize" })).toBe("1 GiB");
      expect(formatNumber(1610612736, { number_style: "filesize" })).toBe("1.5 GiB");
    });
    
    it("should format TiB correctly", () => {
      expect(formatNumber(1099511627776, { number_style: "filesize" })).toBe("1 TiB");
      expect(formatNumber(1649267441664, { number_style: "filesize" })).toBe("1.5 TiB");
    });
    
    it("should format PiB correctly", () => {
      expect(formatNumber(1125899906842624, { number_style: "filesize" })).toBe("1 PiB");
      expect(formatNumber(1688849860263936, { number_style: "filesize" })).toBe("1.5 PiB");
    });
  });
  
  describe("decimal units", () => {
    it("should format with decimal units when specified", () => {
      const options = { number_style: "filesize", filesize_unit_system: "decimal" };
      expect(formatNumber(1000, options)).toBe("1 KB");
      expect(formatNumber(1500, options)).toBe("1.5 KB");
      expect(formatNumber(1000000, options)).toBe("1 MB");
      expect(formatNumber(1500000, options)).toBe("1.5 MB");
      expect(formatNumber(1000000000, options)).toBe("1 GB");
      expect(formatNumber(1500000000, options)).toBe("1.5 GB");
      expect(formatNumber(1000000000000, options)).toBe("1 TB");
      expect(formatNumber(1500000000000, options)).toBe("1.5 TB");
      expect(formatNumber(1000000000000000, options)).toBe("1 PB");
      expect(formatNumber(1500000000000000, options)).toBe("1.5 PB");
    });
  });
  
  describe("header unit display", () => {
    it("should omit unit when filesize_unit_in_header is true", () => {
      const options = { 
        number_style: "filesize", 
        filesize_unit_in_header: true,
        type: "cell"
      };
      expect(formatNumber(1536, options)).toBe("1.5");
      expect(formatNumber(1048576, options)).toBe("1");
    });
    
    it("should include unit when filesize_unit_in_header is false", () => {
      const options = { 
        number_style: "filesize", 
        filesize_unit_in_header: false,
        type: "cell"
      };
      expect(formatNumber(1536, options)).toBe("1.5 KiB");
      expect(formatNumber(1048576, options)).toBe("1 MiB");
    });
  });
  
  describe("decimals control", () => {
    it("should respect decimals setting", () => {
      expect(formatNumber(1536, { 
        number_style: "filesize", 
        decimals: 0 
      })).toBe("2 KiB");
      
      expect(formatNumber(1536, { 
        number_style: "filesize", 
        decimals: 3 
      })).toBe("1.500 KiB");
      
      expect(formatNumber(1536, { 
        number_style: "filesize", 
        decimals: 1 
      })).toBe("1.5 KiB");
    });
    
    it("should not show decimals for bytes", () => {
      expect(formatNumber(512, { 
        number_style: "filesize", 
        decimals: 2 
      })).toBe("512 B");
    });
  });
  
  describe("negative values", () => {
    it("should handle negative file sizes", () => {
      expect(formatNumber(-1024, { number_style: "filesize" })).toBe("-1 KiB");
      expect(formatNumber(-1536, { number_style: "filesize" })).toBe("-1.5 KiB");
      expect(formatNumber(-1048576, { number_style: "filesize" })).toBe("-1 MiB");
    });
  });
  
  describe("edge cases", () => {
    it("should handle very large numbers", () => {
      expect(formatNumber(1125899906842624 * 1000, { number_style: "filesize" })).toBe("1000 PiB");
    });
    
    it("should handle fractional bytes", () => {
      expect(formatNumber(0.5, { number_style: "filesize" })).toBe("1 B"); // Rounds up
      expect(formatNumber(0.1, { number_style: "filesize" })).toBe("0 B");
    });
  });
});
