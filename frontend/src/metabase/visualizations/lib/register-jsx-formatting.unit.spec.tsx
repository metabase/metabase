import type { ReactElement } from "react";

import { setupSdkPlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { render, screen } from "__support__/ui";
import { ensureMetabaseProviderPropsStore } from "embedding-sdk-shared/lib/ensure-metabase-provider-props-store";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { Link } from "metabase/common/components/Link";
import { mockIsEmbeddingSdk } from "metabase/embedding-sdk/mocks/config-mock";
import { formatValue } from "metabase/value-formatting";
import { isElementOfType } from "metabase/value-formatting/test-utils";
import { TYPE } from "metabase-lib/v1/types/constants";
import type { ColumnSettings } from "metabase-types/api";
import {
  createMockColumn,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { registerJsxFormatting } from "./register-jsx-formatting";

// These are integration tests for the JSX renderers this module registers into
// value-formatting. The pure engine behaviour (string outputs, non-jsx paths)
// is tested in isolation in the value-formatting module's own specs; the tests
// here need the registered renderer to produce real ExternalLink/Link output.
registerJsxFormatting();

describe("registered JSX email formatting", () => {
  describe("email link generation", () => {
    it("should create an ExternalLink for valid emails in jsx + rich mode", () => {
      const result = formatValue("test@example.com", {
        jsx: true,
        rich: true,
      });
      // Unjustified type cast. FIXME
      expect(isElementOfType(result as JSX.Element, ExternalLink)).toBe(true);

      // Unjustified type cast. FIXME
      render(result as ReactElement);

      expect(screen.getByRole("link")).toHaveAttribute(
        "href",
        "mailto:test@example.com",
      );
      expect(screen.getByRole("link")).toHaveTextContent("test@example.com");
    });

    it.each([
      "user.name+tag@example.com",
      "user123@subdomain.example.org",
      "test-email@domain-name.com",
      "firstname.lastname@company.co.uk",
    ])("should handle complex valid email address: %s", (email) => {
      const result = formatValue(email, { jsx: true, rich: true });
      // Unjustified type cast. FIXME
      expect(isElementOfType(result as JSX.Element, ExternalLink)).toBe(true);

      // Unjustified type cast. FIXME
      render(result as ReactElement);

      expect(screen.getByRole("link")).toHaveAttribute(
        "href",
        `mailto:${email}`,
      );
      expect(screen.getByRole("link")).toHaveTextContent(email);
    });
  });

  describe("invalid email handling", () => {
    it("should return string for invalid email addresses", () => {
      const invalidEmails = [
        "not-an-email",
        "@example.com",
        "user@",
        "user space@example.com",
        "user@.com",
        "",
      ];

      invalidEmails.forEach((email) => {
        const result = formatValue(email, { jsx: true, rich: true });
        expect(result).toBe(email);
      });
    });

    it("should handle very long email addresses that exceed regex limits", () => {
      // Create an email that's too long (over 254 characters)
      const longEmail = `${"a".repeat(250)}@example.com`;
      const result = formatValue(longEmail, { jsx: true, rich: true });
      expect(result).toBe(longEmail);
    });
  });

  describe("link text handling", () => {
    it("should use custom link_text when provided with clicked data", () => {
      const column = createMockColumn({ name: "email" });
      const clicked = {
        value: "test@example.com",
        column,
        data: [{ value: "test@example.com", col: column }],
      };

      const result = formatValue("test@example.com", {
        jsx: true,
        rich: true,
        link_text: "Custom Label",
        clicked,
      });

      // Unjustified type cast. FIXME
      expect(isElementOfType(result as JSX.Element, ExternalLink)).toBe(true);

      // Unjustified type cast. FIXME
      render(result as ReactElement);

      expect(screen.getByRole("link")).toHaveAttribute(
        "href",
        "mailto:test@example.com",
      );
      expect(screen.getByRole("link")).toHaveTextContent("Custom Label");
    });
  });

  describe("newline collapsing", () => {
    it("should collapse newlines in email text when collapseNewlines is true", () => {
      const emailWithNewlines = "test@example.com\n\rextra text";
      const result = formatValue(emailWithNewlines, {
        jsx: true,
        rich: true,
        collapseNewlines: true,
      });

      // Unjustified type cast. FIXME
      expect(isElementOfType(result as JSX.Element, ExternalLink)).toBe(false);
      expect(result).toBe("test@example.com  extra text");
    });

    it("should collapse newlines in custom link text when collapseNewlines is true", () => {
      const column = createMockColumn({ name: "email" });
      const clicked = {
        value: "test@example.com",
        column,
        data: [{ value: "test@example.com", col: column }],
      };

      const result = formatValue("test@example.com", {
        jsx: true,
        rich: true,
        link_text: "Custom\nLabel",
        clicked,
        collapseNewlines: true,
      });

      // Unjustified type cast. FIXME
      expect(isElementOfType(result as JSX.Element, ExternalLink)).toBe(true);

      // Unjustified type cast. FIXME
      render(result as ReactElement);

      expect(screen.getByRole("link")).toHaveTextContent("Custom Label");
    });
  });

  describe("edge cases", () => {
    it("should handle empty string", () => {
      const result = formatValue("", { jsx: true, rich: true });
      expect(result).toBe("");
    });
  });
});

const SITE_URL = "http://localhost:3000";

describe("registered JSX url formatting", () => {
  beforeAll(() => {
    mockSettings({ "site-url": SITE_URL });
  });

  afterEach(() => {
    ensureMetabaseProviderPropsStore().cleanup();
    jest.restoreAllMocks();
  });

  it("calls handleLinkSdkPlugin and prevents default in SDK", async () => {
    mockSettings({
      "token-features": createMockTokenFeatures({ embedding_sdk: true }),
    });
    setupSdkPlugins();
    await mockIsEmbeddingSdk(true);

    const url = "https://example.com/dashboard/1";
    const handleLink = jest.fn().mockReturnValue({ handled: true });

    ensureMetabaseProviderPropsStore().setProps({
      pluginsConfig: { handleLink },
    });

    // Unjustified type cast. FIXME
    const node = formatValue(url, {
      jsx: true,
      rich: true,
      view_as: "link",
    }) as ReactElement;
    render(node);

    const link = screen.getByRole("link");
    // Manually creating the event instead of using fireEvent.click because we need to inspect
    // the defaultPrevented property of the event.
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    link.dispatchEvent(event);

    expect(handleLink).toHaveBeenCalledWith(url);
    expect(event.defaultPrevented).toBe(true);
  });

  it("does not call handleLinkSdkPlugin in core app", async () => {
    await mockIsEmbeddingSdk(false);

    const url = "https://example.com/dashboard/2";
    const handleLink = jest.fn();

    ensureMetabaseProviderPropsStore().setProps({
      pluginsConfig: { handleLink },
    });

    // Unjustified type cast. FIXME
    const node = formatValue(url, {
      jsx: true,
      rich: true,
      view_as: "link",
    }) as ReactElement;
    render(node);

    const link = screen.getByRole("link");
    // Manually creating the event instead of using fireEvent.click because we need to inspect
    // the defaultPrevented property of the event.
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    link.dispatchEvent(event);

    expect(handleLink).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("should return a component for http:, https:, and mailto: links in jsx mode", () => {
    expect(
      isElementOfType(
        // Unjustified type cast. FIXME
        formatValue("http://metabase.com/", {
          jsx: true,
          rich: true,
        }) as ReactElement,
        ExternalLink,
      ),
    ).toEqual(true);
    expect(
      isElementOfType(
        // Unjustified type cast. FIXME
        formatValue("https://metabase.com/", {
          jsx: true,
          rich: true,
        }) as ReactElement,
        ExternalLink,
      ),
    ).toEqual(true);
    expect(
      isElementOfType(
        // Unjustified type cast. FIXME
        formatValue("mailto:tom@metabase.test", {
          jsx: true,
          rich: true,
        }) as ReactElement,
        ExternalLink,
      ),
    ).toEqual(true);
  });

  it("should return a component for custom protocols if the column type is URL", () => {
    expect(
      isElementOfType(
        // Unjustified type cast. FIXME
        formatValue("myproto:some-custom-thing", {
          jsx: true,
          rich: true,
          column: { semantic_type: TYPE.URL },
        }) as ReactElement,
        ExternalLink,
      ),
    ).toEqual(true);
  });

  it("should not return a component for bad urls if the column type is URL", () => {
    expect(
      // Unjustified type cast. FIXME
      formatValue("invalid-blah-blah-blah", {
        jsx: true,
        rich: true,
        column: { semantic_type: TYPE.URL },
      }) as ReactElement,
    ).toEqual("invalid-blah-blah-blah");
  });

  it("should not return a component for custom protocols if the column type isn't URL", () => {
    expect(
      // Unjustified type cast. FIXME
      formatValue("myproto:some-custom-thing", {
        jsx: true,
        rich: true,
      }) as ReactElement,
    ).toEqual("myproto:some-custom-thing");
  });

  it("should not return a link component for unrecognized links in jsx mode", () => {
    expect(
      isElementOfType(
        // Unjustified type cast. FIXME
        formatValue("metabase.com", { jsx: true, rich: true }) as ReactElement,
        ExternalLink,
      ),
    ).toEqual(false);
  });

  it("should return a string for javascript:, data:, and other links in jsx mode", () => {
    expect(
      // Unjustified type cast. FIXME
      formatValue("javascript:alert('pwnd')", {
        jsx: true,
        rich: true,
      }) as ReactElement,
    ).toEqual("javascript:alert('pwnd')");
    expect(
      // Unjustified type cast. FIXME
      formatValue("data:text/plain;charset=utf-8,hello%20world", {
        jsx: true,
        rich: true,
      }) as ReactElement,
    ).toEqual("data:text/plain;charset=utf-8,hello%20world");
  });

  describe("when view_as = link", () => {
    it("should return link component for type/URL and  view_as = link", () => {
      // Unjustified type cast. FIXME
      const formatted = formatValue("http://whatever", {
        jsx: true,
        rich: true,
        column: { semantic_type: TYPE.URL },
        view_as: "link",
      }) as ReactElement;
      expect(isElementOfType(formatted, ExternalLink)).toEqual(true);
    });

    it("should return link component using link_url and link_text when specified", () => {
      // Unjustified type cast. FIXME
      const formatted = formatValue("http://not.metabase.com", {
        jsx: true,
        rich: true,
        link_text: "metabase link",
        link_url: "http://metabase.com",
        view_as: "link",
        clicked: {},
      }) as ReactElement;

      expect(isElementOfType(formatted, ExternalLink)).toEqual(true);
      expect(formatted.props.children).toEqual("metabase link");
      expect(formatted.props.href).toEqual("http://metabase.com");
    });

    it("should return link component using link_text and the value as url when link_url is empty", () => {
      // Unjustified type cast. FIXME
      const formatted = formatValue("http://metabase.com", {
        jsx: true,
        rich: true,
        link_text: "metabase link",
        link_url: "",
        view_as: "link",
        clicked: {},
      }) as ReactElement;

      expect(isElementOfType(formatted, ExternalLink)).toEqual(true);
      expect(formatted.props.children).toEqual("metabase link");
      expect(formatted.props.href).toEqual("http://metabase.com");
    });

    it("should return link component using link_url and the value as text when link_text is empty", () => {
      // Unjustified type cast. FIXME
      const formatted = formatValue("metabase link", {
        jsx: true,
        rich: true,
        link_text: "",
        link_url: "http://metabase.com",
        view_as: "link",
        clicked: {},
      }) as ReactElement;

      expect(isElementOfType(formatted, ExternalLink)).toEqual(true);
      expect(formatted.props.children).toEqual("metabase link");
      expect(formatted.props.href).toEqual("http://metabase.com");
    });

    it("should apply the column's number formatting settings to the link text when link_text references the current column (metabase#56876)", () => {
      const column = createMockColumn({
        name: "hubspot_id",
        base_type: TYPE.Integer,
      });
      const value = 35660212261;
      // Unjustified type cast. FIXME
      const formatted = formatValue(value, {
        jsx: true,
        rich: true,
        column,
        view_as: "link",
        link_text: "{{hubspot_id}}",
        link_url: "http://example.com/{{hubspot_id}}",
        number_style: "decimal",
        // No thousand separator: the user has chosen to render the value
        // without group separators (e.g. for ID-like numbers).
        number_separators: ".",
        clicked: {
          value,
          column,
          data: [{ value, col: column }],
          settings: {
            column_settings: {
              '["name","hubspot_id"]': {
                number_style: "decimal",
                number_separators: ".",
              },
            },
          },
        },
      }) as ReactElement;

      expect(isElementOfType(formatted, ExternalLink)).toBe(true);
      expect(formatted.props.children).toBe("35660212261");
    });

    it("should apply the column's separator-style setting to a link text referencing the current column", () => {
      const column = createMockColumn({
        name: "amount",
        base_type: TYPE.Float,
      });
      const value = 1234567.89;
      // Unjustified type cast. FIXME
      const formatted = formatValue(value, {
        jsx: true,
        rich: true,
        column,
        view_as: "link",
        link_text: "{{amount}}",
        link_url: "http://example.com",
        number_style: "decimal",
        // European-style separators: "." for thousands, "," for decimals.
        number_separators: ",.",
        clicked: {
          value,
          column,
          data: [{ value, col: column }],
          settings: {
            column_settings: {
              '["name","amount"]': {
                number_style: "decimal",
                number_separators: ",.",
              },
            },
          },
        },
      }) as ReactElement;

      expect(isElementOfType(formatted, ExternalLink)).toBe(true);
      expect(formatted.props.children).toBe("1.234.567,89");
    });

    it("should apply a different column's formatting when link_text references that other column", () => {
      const linkColumn = createMockColumn({
        name: "name",
        base_type: TYPE.Text,
      });
      const amountColumn = createMockColumn({
        name: "amount",
        base_type: TYPE.Float,
      });
      const linkValue = "Widget";
      const amountValue = 1234567.89;
      // Unjustified type cast. FIXME
      const formatted = formatValue(linkValue, {
        jsx: true,
        rich: true,
        column: linkColumn,
        view_as: "link",
        link_text: "Buy for {{amount}}",
        link_url: "http://example.com",
        clicked: {
          value: linkValue,
          column: linkColumn,
          data: [
            { value: linkValue, col: linkColumn },
            { value: amountValue, col: amountColumn },
          ],
          settings: {
            column_settings: {
              '["name","amount"]': {
                number_style: "currency",
                currency: "USD",
                currency_style: "symbol",
              },
            },
          },
        },
      }) as ReactElement;

      expect(isElementOfType(formatted, ExternalLink)).toBe(true);
      expect(formatted.props.children).toBe("Buy for $1,234,567.89");
    });

    it("should not return an ExternalLink in jsx + rich mode if there's click behavior", () => {
      // Unjustified type cast. FIXME
      const formatted = formatValue("http://metabase.com/", {
        jsx: true,
        rich: true,
        click_behavior: {
          linkTemplate: "foo",
          linkTextTemplate: "bar",
          linkType: "url",
          type: "link",
        },
        link_text: "metabase link",
        link_url: "http://metabase.com",
        view_as: "link",
        clicked: {},
      }) as ReactElement;

      // it is not a link set on the question level
      expect(isElementOfType(formatted, ExternalLink)).toEqual(false);
      // expect the text to be in a div (which has link formatting) rather than ExternalLink
      expect(formatted.props["data-testid"]).toEqual("link-formatted-text");
    });
  });

  it("should not crash if column is null", () => {
    expect(
      formatValue("foobar", {
        jsx: true,
        rich: true,
        column: null,
      }),
    ).toEqual("foobar");
  });
});

describe("registered JSX value formatting", () => {
  const setup = (value: any, overrides: Partial<ColumnSettings> = {}) => {
    mockSettings();
    const column = createMockColumn({
      base_type: "type/Float",
    });
    const options: ColumnSettings = {
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
      });
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
      });
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
      });
      setup(1, { column, scale: 100 });
      expect(
        screen.getByText("400,000,000,000,000,000,000"),
      ).toBeInTheDocument();

      setup(2, { column, scale: 100 });
      expect(screen.getByText("200")).toBeInTheDocument();
    });
  });

  describe("collapseNewlines", () => {
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

    it("should collapse newlines in remapped values", () => {
      const column = createMockColumn({
        base_type: "type/Integer",
        remapping: new Map([[1, "Value\nwith\nnewlines"]]),
      });
      setup(1, {
        column,
        collapseNewlines: true,
        jsx: true,
      });
      expect(screen.getByText("Value with newlines")).toBeInTheDocument();
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

  it("should return the component for external links in jsx + rich mode", () => {
    expect(
      isElementOfType(
        // Unjustified type cast. FIXME
        formatValue("http://metabase.com/", {
          jsx: true,
          rich: true,
        }) as ReactElement,
        ExternalLink,
      ),
    ).toEqual(true);
  });

  it("should return a component for internal links in jsx + rich mode", () => {
    mockSettings({ "site-url": SITE_URL });
    expect(
      isElementOfType(
        // Unjustified type cast. FIXME
        formatValue(SITE_URL, { jsx: true, rich: true }) as ReactElement,
        Link,
      ),
    ).toBe(true);
  });

  it("should return a component for relative links in jsx + rich mode", () => {
    const column = createMockColumn({
      name: "column_name",
      base_type: "type/Text",
      effective_type: "type/Text",
      semantic_type: "type/URL",
    });
    expect(
      isElementOfType(
        // Unjustified type cast. FIXME
        formatValue("/question/12", {
          jsx: true,
          rich: true,
          view_as: "link",
          link_url: "{{column_name}}",
          clicked: {
            value: "/question/12",
            column: column,
            data: [{ value: "question/12", col: column }],
          },
        }) as ReactElement,
        Link,
      ),
    ).toEqual(true);
  });

  it("should not return an ExternalLink for links in jsx + rich mode if there's click behavior", () => {
    // Unjustified type cast. FIXME
    const formatted = formatValue("http://metabase.com/", {
      jsx: true,
      rich: true,
      click_behavior: {
        linkTemplate: "foo",
        linkTextTemplate: "foo",
        linkType: "url",
        type: "link",
      },
      clicked: {},
    }) as ReactElement;
    // it's not actually a link
    expect(isElementOfType(formatted, ExternalLink)).toEqual(false);
    // expect the text to be in a div (which has link formatting) rather than ExternalLink
    expect(formatted.props["data-testid"]).toEqual("link-formatted-text");
  });

  it("should render image", () => {
    // Unjustified type cast. FIXME
    const formatted = formatValue("http://metabase.com/logo.png", {
      jsx: true,
      rich: true,
      view_as: "image",
      column: { semantic_type: "type/ImageURL" },
    }) as ReactElement;
    expect(formatted.type).toEqual("img");
    expect(formatted.props.src).toEqual("http://metabase.com/logo.png");
  });

  it("should render image with a click behavior in jsx + rich mode (metabase#17161)", () => {
    // Unjustified type cast. FIXME
    const formatted = formatValue("http://metabase.com/logo.png", {
      jsx: true,
      rich: true,
      view_as: "image",
      click_behavior: {
        linkTemplate: "foo",
        linkType: "url",
        type: "link",
      },
      clicked: {},
    }) as ReactElement;
    expect(formatted.type).toEqual("img");
    expect(formatted.props.src).toEqual("http://metabase.com/logo.png");
  });

  it("should return a component for email addresses in jsx + rich mode", () => {
    expect(
      isElementOfType(
        // Unjustified type cast. FIXME
        formatValue("tom@metabase.test", {
          jsx: true,
          rich: true,
        }) as ReactElement,
        ExternalLink,
      ),
    ).toEqual(true);
  });
});
