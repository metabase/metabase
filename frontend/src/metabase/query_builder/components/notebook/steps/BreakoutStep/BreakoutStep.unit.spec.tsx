import React from "react";
import userEvent from "@testing-library/user-event";
import { render, screen, getIcon } from "__support__/ui";
import { checkNotNull } from "metabase/core/utils/types";
import { ORDERS } from "metabase-types/api/mocks/presets";
import type StructuredQuery from "metabase-lib/queries/StructuredQuery";
import {
  createMockNotebookStep,
  DEFAULT_LEGACY_QUERY,
  metadata,
} from "../../test-utils";
import BreakoutStep from "./BreakoutStep";

function setup(step = createMockNotebookStep()) {
  const updateQuery = jest.fn();

  render(
    <BreakoutStep
      step={step}
      query={step.query}
      topLevelQuery={step.topLevelQuery}
      color="summarize"
      isLastOpened={false}
      reportTimezone="UTC"
      updateQuery={updateQuery}
    />,
  );

  function getNextQuery() {
    const [lastCall] = updateQuery.mock.calls.slice(-1);
    return lastCall[0] as StructuredQuery;
  }

  return { getNextQuery, updateQuery };
}

describe("BreakoutStep", () => {
  it("should render correctly without a breakout", () => {
    setup();
    expect(screen.getByText("Pick a column to group by")).toBeInTheDocument();
  });

  it("should render a breakout correctly", () => {
    const createdAt = checkNotNull(metadata.field(ORDERS.CREATED_AT));
    const query = DEFAULT_LEGACY_QUERY.breakout(createdAt);
    setup(createMockNotebookStep({ query }));

    expect(screen.getByText("Created At")).toBeInTheDocument();
  });

  it("should add a breakout", () => {
    const { getNextQuery } = setup();

    userEvent.click(screen.getByText("Pick a column to group by"));
    userEvent.click(screen.getByText("Created At"));

    const [breakout] = getNextQuery().breakouts();
    expect(breakout.dimension().displayName()).toBe("Created At");
  });

  it("should change a breakout column", () => {
    const createdAt = checkNotNull(metadata.field(ORDERS.CREATED_AT));
    const query = DEFAULT_LEGACY_QUERY.breakout(createdAt);
    const { getNextQuery } = setup(createMockNotebookStep({ query }));

    userEvent.click(screen.getByText("Created At"));
    userEvent.click(screen.getByText("Product"));
    userEvent.click(screen.getByText("Category"));

    const [breakout] = getNextQuery().breakouts();
    expect(breakout.dimension().displayName()).toBe("Category");
  });

  it("should remove a breakout", () => {
    const createdAt = checkNotNull(metadata.field(ORDERS.CREATED_AT));
    const query = DEFAULT_LEGACY_QUERY.breakout(createdAt);
    const { getNextQuery } = setup(createMockNotebookStep({ query }));

    userEvent.click(getIcon("close"));

    expect(getNextQuery().breakouts()).toHaveLength(0);
  });
});
