import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getBrokenUpTextMatcher } from "__support__/ui";
import { createMockDatabase } from "metabase-types/api/mocks";
import { getHelpText } from "./ExpressionEditorTextfield/helper-text-strings";
import ExpressionEditorHelpText, {
  ExpressionEditorHelpTextProps,
} from "./ExpressionEditorHelpText";

const database = createMockDatabase();

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

  it("should render function arguments with tooltip", async () => {
    const {
      props: { helpText },
    } = setup({ helpText: getHelpText("concat", database, "UTC") });

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
      getHelpText("datetime-diff", database, "UTC"),
    width: 397,
    target,
    ...additionalProps,
  };

  render(<ExpressionEditorHelpText {...props} />);

  return { props };
}
