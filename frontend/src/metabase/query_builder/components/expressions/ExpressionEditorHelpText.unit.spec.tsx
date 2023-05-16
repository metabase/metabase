import React from "react";
import { render, screen, within } from "@testing-library/react";
import { createMockMetadata } from "__support__/metadata";
import { getBrokenUpTextMatcher } from "__support__/ui";
import { checkNotNull } from "metabase/core/utils/types";
import { createMockDatabase } from "metabase-types/api/mocks";
import { getHelpText } from "./ExpressionEditorTextfield/helper-text-strings";
import ExpressionEditorHelpText, {
  ExpressionEditorHelpTextProps,
} from "./ExpressionEditorHelpText";

const DB_ID = 1;

const metadata = createMockMetadata({
  databases: [createMockDatabase({ id: DB_ID })],
});

const DATABASE = checkNotNull(metadata.database(DB_ID));

describe("ExpressionEditorHelpText", () => {
  it("should render expression function info, example and documentation link", async () => {
    await setup();

    expect(
      screen.getByText('datetimeDiff([Created At], [Shipped At], "month")'),
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        getBrokenUpTextMatcher("datetimeDiff(datetime1, datetime2, unit)"),
      ),
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        "Get the difference between two datetime values (datetime2 minus datetime1) using the specified unit of time.",
      ),
    ).toBeInTheDocument();

    const link = screen.getByRole("link");
    expect(link).toBeInTheDocument();
    expect(link).toHaveProperty(
      "href",
      "https://www.metabase.com/docs/latest/questions/query-builder/expressions/datetimediff.html",
    );
  });

  it("should handle expression function without arguments", async () => {
    await setup({ helpText: getHelpText("cum-count", DATABASE, "UTC") });

    expect(screen.getAllByText("CumulativeCount")).toHaveLength(2);

    const exampleCodeEl = screen.getByTestId(
      "expression-helper-popover-structure",
    );
    expect(
      within(exampleCodeEl).getByText("CumulativeCount"),
    ).toBeInTheDocument();

    expect(
      screen.getByText("The additive total of rows across a breakout."),
    ).toBeInTheDocument();
  });

  it("should render function arguments", async () => {
    const {
      props: { helpText },
    } = await setup({ helpText: getHelpText("concat", DATABASE, "UTC") });

    const argumentsBlock = screen.getByTestId(
      "expression-helper-popover-arguments",
    );

    helpText?.args?.forEach(({ name, description }) => {
      expect(within(argumentsBlock).getByText(name)).toBeInTheDocument();
      expect(within(argumentsBlock).getByText(description)).toBeInTheDocument();
    });
  });
});

async function setup(additionalProps?: Partial<ExpressionEditorHelpTextProps>) {
  const target = { current: null };

  const props: ExpressionEditorHelpTextProps = {
    helpText:
      additionalProps?.helpText ||
      getHelpText("datetime-diff", DATABASE, "UTC"),
    width: 397,
    target,
    ...additionalProps,
  };

  render(<ExpressionEditorHelpText {...props} />);

  // have to wait for TippyPopover to render content
  expect(
    await screen.findByTestId("expression-helper-popover"),
  ).toBeInTheDocument();

  return { props };
}
