import React from "react";
import { render, screen } from "@testing-library/react";
import { createMockDatabase } from "metabase-types/api/mocks";
import { getHelpText } from "./ExpressionEditorTextfield/helper-text-strings";
import ExpressionEditorHelpText, {
  ExpressionEditorHelpTextProps,
} from "./ExpressionEditorHelpText";

describe("ExpressionEditorHelpText", () => {
  it("should render expression function info and example", async () => {
    setup();

    // have to wait for TippyPopover to render content
    expect(
      await screen.findByText("datetimeDiff(datetime1, datetime2, unit)"),
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        "Get the difference between two datetime values (datetime2 minus datetime1) using the specified unit of time.",
      ),
    ).toBeInTheDocument();

    expect(
      screen.getByText('datetimeDiff([created_at], [shipped_at], "month")'),
    ).toBeInTheDocument();
  });
});

function setup(additionalProps?: Partial<ExpressionEditorHelpTextProps>) {
  const target = { current: null };
  const database = createMockDatabase();

  const props: ExpressionEditorHelpTextProps = {
    helpText:
      additionalProps?.helpText ||
      getHelpText("datetime-diff", database, "UTC") ||
      null,
    width: 397,
    target,
    ...additionalProps,
  };

  render(<ExpressionEditorHelpText {...props} />);
}
