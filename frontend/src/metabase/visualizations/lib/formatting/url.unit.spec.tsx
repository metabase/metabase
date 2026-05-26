import type { ReactElement } from "react";
import { isElementOfType } from "react-dom/test-utils";

import { setupSdkPlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { render, screen } from "__support__/ui";
import { ensureMetabaseProviderPropsStore } from "embedding-sdk-shared/lib/ensure-metabase-provider-props-store";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { mockIsEmbeddingSdk } from "metabase/embedding-sdk/mocks/config-mock";
import { TYPE } from "metabase-lib/v1/types/constants";
import {
  createMockColumn,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { formatUrl, slugify } from "./url";
import { formatValue } from "./value";

const SITE_URL = "http://localhost:3000";

describe("formatUrl", () => {
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

    const node = formatUrl(url, {
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

    const node = formatUrl(url, {
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

  it("should return a string when not in jsx mode", () => {
    expect(formatUrl("http://metabase.com/")).toEqual("http://metabase.com/");
  });

  it("should return a component for http:, https:, and mailto: links in jsx mode", () => {
    expect(
      isElementOfType(
        formatUrl("http://metabase.com/", {
          jsx: true,
          rich: true,
        }) as ReactElement,
        ExternalLink,
      ),
    ).toEqual(true);
    expect(
      isElementOfType(
        formatUrl("https://metabase.com/", {
          jsx: true,
          rich: true,
        }) as ReactElement,
        ExternalLink,
      ),
    ).toEqual(true);
    expect(
      isElementOfType(
        formatUrl("mailto:tom@metabase.test", {
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
        formatUrl("myproto:some-custom-thing", {
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
      formatUrl("invalid-blah-blah-blah", {
        jsx: true,
        rich: true,
        column: { semantic_type: TYPE.URL },
      }) as ReactElement,
    ).toEqual("invalid-blah-blah-blah");
  });

  it("should not return a component for custom protocols if the column type isn't URL", () => {
    expect(
      formatUrl("myproto:some-custom-thing", {
        jsx: true,
        rich: true,
      }) as ReactElement,
    ).toEqual("myproto:some-custom-thing");
  });

  it("should not return a link component for unrecognized links in jsx mode", () => {
    expect(
      isElementOfType(
        formatUrl("metabase.com", { jsx: true, rich: true }) as ReactElement,
        ExternalLink,
      ),
    ).toEqual(false);
  });

  it("should return a string for javascript:, data:, and other links in jsx mode", () => {
    expect(
      formatUrl("javascript:alert('pwnd')", {
        jsx: true,
        rich: true,
      }) as ReactElement,
    ).toEqual("javascript:alert('pwnd')");
    expect(
      formatUrl("data:text/plain;charset=utf-8,hello%20world", {
        jsx: true,
        rich: true,
      }) as ReactElement,
    ).toEqual("data:text/plain;charset=utf-8,hello%20world");
  });

  describe("when view_as = link", () => {
    it("should return link component for type/URL and  view_as = link", () => {
      const formatted = formatUrl("http://whatever", {
        jsx: true,
        rich: true,
        column: { semantic_type: TYPE.URL },
        view_as: "link",
      }) as ReactElement;
      expect(isElementOfType(formatted, ExternalLink)).toEqual(true);
    });

    it("should return link component using link_url and link_text when specified", () => {
      const formatted = formatUrl("http://not.metabase.com", {
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
      const formatted = formatUrl("http://metabase.com", {
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
      const formatted = formatUrl("metabase link", {
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
      formatUrl("foobar", {
        jsx: true,
        rich: true,
        column: null,
      }),
    ).toEqual("foobar");
  });

  describe("slugify", () => {
    it("should slugify Chinese", () => {
      expect(slugify("類型")).toEqual("%E9%A1%9E%E5%9E%8B");
    });

    it("should slugify multiple words", () => {
      expect(slugify("Test Parameter")).toEqual("test_parameter");
    });

    it("should slugify Russian", () => {
      expect(slugify("русский язык")).toEqual(
        "%D1%80%D1%83%D1%81%D1%81%D0%BA%D0%B8%D0%B9_%D1%8F%D0%B7%D1%8B%D0%BA",
      );
    });

    it("should slugify diacritics", () => {
      expect(slugify("än umlaut")).toEqual("%C3%A4n_umlaut");
    });
  });
});
