import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  createOrdersTable,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";
import { createEntitiesState } from "__support__/store";
import { getIcon } from "__support__/ui";
import { getMetadata } from "metabase/selectors/metadata";
import { createMockState } from "metabase-types/store/mocks";
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

const createMockQueryFoxExpressions = () => {
  const TABLE_ID = 1;

  const state = createMockState({
    entities: createEntitiesState({
      databases: [createSampleDatabase()],
      tables: [createOrdersTable()],
    }),
  });

  const metadata = getMetadata(state);
  const query = metadata.table(TABLE_ID)?.query();

  return query;
};

const onChangeExpressionMock = jest.fn();
function setup(additionalProps?: Partial<ExpressionWidgetProps>) {
  const props = {
    expression: undefined,
    name: undefined,
    query: createMockQueryFoxExpressions(),
    reportTimezone: "UTC",
    onChangeExpression: onChangeExpressionMock,
    ...additionalProps,
  };

  render(<ExpressionWidget {...props} />);
}
