import { mockSettings } from "__support__/settings";
import { render, screen } from "__support__/ui";
import { createMockColumn } from "metabase-types/api/mocks";

import type { OptionsType } from "./types";
import { formatValue } from "./value";

describe("formatValue", () => {
  const setup = (value: any, overrides: Partial<OptionsType> = {}) => {
    mockSettings();
    const column = createMockColumn({
      base_type: "type/Float",
    });
    const options: OptionsType = {
      view_as: "auto",
      column: column,
      type: "cell",
      jsx: true,
      rich: true,
      clicked: {
        value: value,
        column: column,
        origin: {
          rowIndex: 0,
          row: [value],
          cols: [column],
        },
        data: [
          {
            value: value,
            col: column,
          },
        ],
      },
      ...overrides,
    };
    render(<>{formatValue(value, options)}</>);
  };

  describe("link", () => {
    it("should not apply prefix or suffix more than once for links with no link_text", () => {
      setup(23.12, {
        view_as: "link",
        prefix: "foo ",
        suffix: " bar",
        link_url: "http://google.ca",
      });
      expect(
        screen.getByText((content) => content.startsWith("foo")),
      ).toBeInTheDocument();
      expect(
        screen.getByText((content) => content.endsWith("bar")),
      ).toBeInTheDocument();
      expect(screen.getByText("23.12")).toBeInTheDocument();
    });

    it("should not apply prefix or suffix to null values", () => {
      setup(null, {
        prefix: "foo ",
        suffix: " bar",
      });

      const anyContent = screen.queryByText(/./);
      expect(anyContent).not.toBeInTheDocument();
    });

    it("should trim values to specified decimals", () => {
      setup(23.123459, {
        decimals: 5,
        number_style: "decimal",
        number_separators: ".",
      });
      expect(screen.getByText("23.12346")).toBeInTheDocument();
    });

    it("should preserve number separator formatting when displayed as a link with no URL set", () => {
      setup(100000.0, {
        view_as: "link",
        number_style: "decimal",
        number_separators: ".,",
      });
      expect(screen.getByText("100,000")).toBeInTheDocument();
    });

    it("should preserve number separator formatting when displayed as a link with a custom URL", () => {
      setup(100000.0, {
        view_as: "link",
        number_style: "decimal",
        number_separators: ".,",
        link_url: "http://example.com",
      });
      expect(screen.getByText("100,000")).toBeInTheDocument();
    });
  });

  describe("remapped column", () => {
    it("should apply formatting settings", () => {
      const column = createMockColumn({
        base_type: "type/Float",
        remapped_to_column: createMockColumn({
          base_type: "type/Text",
        }),
        remapping: new Map([
          [1, "One"],
          [2, "2"],
          [3, "Three"],
        ]),
      } as any);
      setup(1, { column, scale: 100 });
      expect(screen.getByText("One")).toBeInTheDocument();

      setup(2, { column, scale: 100 });
      expect(screen.getByText("200")).toBeInTheDocument();
    });

    it("should correctly parse string with initial digit", () => {
      const column = createMockColumn({
        base_type: "type/Float",
        remapped_to_column: createMockColumn({
          base_type: "type/Text",
        }),
        remapping: new Map([
          [1, "1j"],
          [2, "2"],
          [3, "Three"],
        ]),
      } as any);
      setup(1, { column, scale: 100 });
      expect(screen.getByText("1j")).toBeInTheDocument();

      setup(2, { column, scale: 100 });
      expect(screen.getByText("200")).toBeInTheDocument();
    });

    it("should correctly parse string with big integer", () => {
      const column = createMockColumn({
        base_type: "type/Float",
        remapped_to_column: createMockColumn({
          base_type: "type/Text",
        }),
        remapping: new Map([
          [1, "4000000000000000000"], // bigger than 9,007,199,254,740,991 to trigger BigInt branch
          [2, "2"],
          [3, "Three"],
        ]),
      } as any);
      setup(1, { column, scale: 100 });
      expect(
        screen.getByText("400,000,000,000,000,000,000"),
      ).toBeInTheDocument();

      setup(2, { column, scale: 100 });
      expect(screen.getByText("200")).toBeInTheDocument();
    });
  });

  describe("collapseNewlines", () => {
    it("should collapse newlines in plain text when collapseNewlines is true", () => {
      const result = formatValue("Line 1\nLine 2\nLine 3", {
        collapseNewlines: true,
        jsx: false,
      });
      expect(result).toBe("Line 1 Line 2 Line 3");
    });

    it("should preserve newlines when collapseNewlines is false", () => {
      const result = formatValue("Line 1\nLine 2\nLine 3", {
        collapseNewlines: false,
        jsx: false,
      });
      expect(result).toBe("Line 1\nLine 2\nLine 3");
    });

    it("should preserve newlines when collapseNewlines is not specified", () => {
      const result = formatValue("Line 1\nLine 2\nLine 3", {
        jsx: false,
      });
      expect(result).toBe("Line 1\nLine 2\nLine 3");
    });

    it("should collapse newlines in jsx link display text", () => {
      setup("http://example.com", {
        collapseNewlines: true,
        jsx: true,
        rich: true,
        view_as: "link",
        link_text: "Display\nText\nWith\nNewlines",
        clicked: { value: "http://example.com" },
      });
      expect(screen.getByRole("link")).toHaveTextContent(
        "Display Text With Newlines",
      );
    });

    it("should collapse newlines in JSX email link display text", () => {
      const column = createMockColumn({
        base_type: "type/Text",
        semantic_type: "type/Email",
      });
      setup("user@example.com", {
        collapseNewlines: true,
        jsx: true,
        rich: true,
        column,
        link_text: "Contact\nUser",
        clicked: { value: "user@example.com" },
      });
      expect(screen.getByRole("link")).toHaveTextContent("Contact User");
    });

    it("should collapse newlines with prefix and suffix", () => {
      setup("Value\nwith\nnewlines", {
        collapseNewlines: true,
        prefix: "Prefix:\n ",
        suffix: " \n:Suffix",
        jsx: true,
      });
      expect(
        screen.getByText((content) =>
          content.includes("Prefix: Value with newlines :Suffix"),
        ),
      ).toBeInTheDocument();
    });

    it("should handle null values with collapseNewlines", () => {
      const result = formatValue(null, {
        collapseNewlines: true,
        jsx: false,
      });
      expect(result).toBe(null);
    });

    it("should handle numbers with collapseNewlines", () => {
      const result = formatValue(123.45, {
        collapseNewlines: true,
        jsx: false,
        column: createMockColumn({ base_type: "type/Float" }),
      });
      expect(result).toBe("123.45");
    });

    it("should collapse newlines in remapped values", () => {
      const column = createMockColumn({
        base_type: "type/Integer",
        remapping: new Map([[1, "Value\nwith\nnewlines"]]),
      } as any);
      setup(1, {
        column,
        collapseNewlines: true,
        jsx: true,
      });
      expect(screen.getByText("Value with newlines")).toBeInTheDocument();
    });

    it("should collapse multiple consecutive newlines", () => {
      const result = formatValue("Line 1\n\n\nLine 2", {
        collapseNewlines: true,
        jsx: false,
      });
      expect(result).toBe("Line 1   Line 2");
    });

    it("should collapse Windows CRLF newlines", () => {
      const result = formatValue("Line 1\r\nLine 2\r\nLine 3", {
        collapseNewlines: true,
        jsx: false,
      });
      expect(result).toBe("Line 1 Line 2 Line 3");
    });

    it("should collapse old Mac CR newlines", () => {
      const result = formatValue("Line 1\rLine 2\rLine 3", {
        collapseNewlines: true,
        jsx: false,
      });
      expect(result).toBe("Line 1 Line 2 Line 3");
    });

    it("should collapse mixed newline types", () => {
      const result = formatValue("Line 1\nLine 2\r\nLine 3\rLine 4", {
        collapseNewlines: true,
        jsx: false,
      });
      expect(result).toBe("Line 1 Line 2 Line 3 Line 4");
    });

    it("should collapse Unicode line separators", () => {
      const result = formatValue("Line 1\u2028Line 2\u2029Line 3", {
        collapseNewlines: true,
        jsx: false,
      });
      expect(result).toBe("Line 1 Line 2 Line 3");
    });

    it("should collapse newlines in click behavior link text", () => {
      setup("Text\nwith\nnewlines", {
        collapseNewlines: true,
        jsx: true,
        rich: true,
        click_behavior: {
          type: "link",
          linkType: "url",
          linkTemplate: "http://example.com",
        },
      });
      expect(screen.getByTestId("link-formatted-text")).toHaveTextContent(
        "Text with newlines",
      );
    });
  });
});
