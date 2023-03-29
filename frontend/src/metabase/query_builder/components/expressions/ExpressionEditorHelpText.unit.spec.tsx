import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getBrokenUpTextMatcher } from "__support__/ui";
import { createMockDatabase } from "metabase-types/api/mocks";
import Database from "metabase-lib/metadata/Database";
import { getHelpText } from "./ExpressionEditorTextfield/helper-text-strings";
import ExpressionEditorHelpText, {
  ExpressionEditorHelpTextProps,
} from "./ExpressionEditorHelpText";

const DATABASE = new Database(createMockDatabase());

describe("ExpressionEditorHelpText", () => {
  it("should render expression function info and example", async () => {
    setup();

    // have to wait for TippyPopover to render content
    await waitFor(() => {
      expect(
        screen.getByTestId("expression-helper-popover"),
      ).toBeInTheDocument();
    });

    expect(
      screen.getByText('datetimeDiff([created_at], [shipped_at], "month")'),
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
  });

  it("should handle expression function without arguments", async () => {
    setup({ helpText: getHelpText("cum-count", DATABASE, "UTC") });

    // have to wait for TippyPopover to render content
    await waitFor(() => {
      expect(
        screen.getByTestId("expression-helper-popover"),
      ).toBeInTheDocument();
    });

    expect(screen.getAllByText("CumulativeCount")).toHaveLength(2);

    const exampleCodeEl = screen.getByTestId(
      "expression-helper-popover-arguments",
    );
    expect(
      within(exampleCodeEl).getByText("CumulativeCount"),
    ).toBeInTheDocument();

    expect(
      screen.getByText("The additive total of rows across a breakout."),
    ).toBeInTheDocument();
  });

  it("should render function arguments with tooltip", async () => {
    const {
      props: { helpText },
    } = setup({ helpText: getHelpText("concat", DATABASE, "UTC") });

    // have to wait for TippyPopover to render content
    await waitFor(() => {
      expect(
        screen.getByTestId("expression-helper-popover-arguments"),
      ).toBeInTheDocument();
    });

    const argumentsCodeBlock = screen.getByTestId(
      "expression-helper-popover-arguments",
    );

    helpText?.args?.forEach(({ name, description }) => {
      const argumentEl = within(argumentsCodeBlock).getByText(name);

      expect(argumentEl).toBeInTheDocument();

      userEvent.hover(argumentEl);

      expect(screen.getByText(description)).toBeInTheDocument();
    });
  });
});

function setup(additionalProps?: Partial<ExpressionEditorHelpTextProps>) {
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

  return { props };
}
