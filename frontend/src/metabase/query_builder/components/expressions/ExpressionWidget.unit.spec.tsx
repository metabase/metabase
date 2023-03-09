import React from "react";
import userEvent from "@testing-library/user-event";
import { getIcon, render, screen } from "__support__/ui";
import { createEntitiesState } from "__support__/store";
import { getMetadata } from "metabase/selectors/metadata";
import { createMockState } from "metabase-types/store/mocks";
import {
  createSampleDatabase,
  ORDERS_ID,
} from "metabase-types/api/mocks/presets";
import ExpressionWidget, { ExpressionWidgetProps } from "./ExpressionWidget";

describe("ExpressionWidget", () => {
  it("should render proper controls", () => {
    setup();

    expect(screen.getByText("Expression")).toBeInTheDocument();
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument();
  });

  it("should render help icon with tooltip which leads to documentation page", () => {
    setup();

    const icon = getIcon("info");
    expect(icon).toBeInTheDocument();

    const link = screen.getByRole("link", {
      name: "Open expressions documentation",
    });
    expect(link).toBeInTheDocument();

    expect(link).toHaveAttribute(
      "href",
      "https://www.metabase.com/docs/latest/questions/query-builder/expressions.html",
    );

    userEvent.hover(link);

    expect(
      screen.getByText(
        "You can reference columns here in functions or equations, like: floor([Price] - [Discount]). Click for documentation.",
      ),
    ).toBeInTheDocument();
  });

  it("should not render Name field if withName=false", () => {
    setup({ withName: false });

    expect(screen.queryByText("Name")).not.toBeInTheDocument();
  });

  it("should render interactive header if title is passed", () => {
    const mockTitle = "Custom Expression";
    const { onClose } = setup({ title: mockTitle });

    const title = screen.getByText(mockTitle);
    expect(title).toBeInTheDocument();

    userEvent.click(title);

    expect(onClose).toHaveBeenCalled();
  });
});

const createMockQueryForExpressions = () => {
  const state = createMockState({
    entities: createEntitiesState({
      databases: [createSampleDatabase()],
    }),
  });

  const metadata = getMetadata(state);
  const query = metadata.table(ORDERS_ID)?.query();

  return query;
};

function setup(additionalProps?: Partial<ExpressionWidgetProps>) {
  const mocks = {
    onClose: jest.fn(),
    onChangeExpression: jest.fn(),
  };

  const props = {
    expression: undefined,
    name: undefined,
    query: createMockQueryForExpressions(),
    reportTimezone: "UTC",
    ...mocks,
    ...additionalProps,
  };

  render(<ExpressionWidget {...props} />);

  return mocks;
}
