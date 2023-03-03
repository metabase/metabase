import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getIcon } from "__support__/ui";
import { createMockState } from "metabase-types/store/mocks";
import { createEntitiesState } from "__support__/store";
import {
  createSampleDatabase,
  ORDERS_ID,
} from "metabase-types/api/mocks/presets";
import { getMetadata } from "metabase/selectors/metadata";
import ExpressionWidget, { ExpressionWidgetProps } from "./ExpressionWidget";

describe("ExpressionWidget", () => {
  it("should render proper controls", () => {
    setup();

    expect(screen.getByText("Expression")).toBeInTheDocument();
    expect(screen.getByText("Name")).toBeInTheDocument();

    expect(screen.getByText("Cancel")).toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument();
  });

  it("should render help icon with tooltip", () => {
    setup();

    const icon = getIcon("info");
    expect(icon).toBeInTheDocument();

    userEvent.hover(icon);

    expect(
      screen.getByText(
        "You can reference columns here in functions or equations, like: floor([Price] - [Discount]).",
      ),
    ).toBeInTheDocument();
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
