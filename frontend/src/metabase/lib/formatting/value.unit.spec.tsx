import { mockSettings } from "__support__/settings";
import { screen, render } from "__support__/ui";
import { createMockColumn } from "metabase-types/api/mocks";

import type { OptionsType } from "./types";
import { formatValue } from "./value";

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
      screen.getByText(content => content.startsWith("foo")),
    ).toBeInTheDocument();
    expect(
      screen.getByText(content => content.endsWith("bar")),
    ).toBeInTheDocument();
    expect(screen.getByText("23.12")).toBeInTheDocument();
  });

  it("should trim values to specified decimals", () => {
    setup(23.123459, {
      decimals: 5,
      number_style: "decimal",
      number_separators: ".",
    });
    expect(screen.getByText("23.12346")).toBeInTheDocument();
  });
});
