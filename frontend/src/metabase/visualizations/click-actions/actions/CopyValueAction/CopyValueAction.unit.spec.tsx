import { createMockMetadata } from "__support__/metadata";
import {
  type ClickObject,
  isCustomClickAction,
} from "metabase/visualizations/types";
import type { ComputedVisualizationSettings } from "metabase/viz-core";
import Question from "metabase-lib/v1/Question";
import { getColumnKey } from "metabase-lib/v1/queries/utils/column-key";
import {
  createMockColumn,
  createMockNumericColumn,
} from "metabase-types/api/mocks";
import {
  createSampleDatabase,
  createSavedStructuredCard,
} from "metabase-types/api/mocks/presets";

import { CopyValueAction } from "./CopyValueAction";

const setup = (
  clicked: ClickObject | undefined,
  settings: ComputedVisualizationSettings = {},
) => {
  const metadata = createMockMetadata({
    databases: [createSampleDatabase()],
  });
  const question = new Question(createSavedStructuredCard(), metadata);
  return CopyValueAction({ question, clicked, settings });
};

const copyValue = (
  clicked: ClickObject,
  settings?: ComputedVisualizationSettings,
) => {
  const writeText = jest.fn().mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText } });
  const closePopover = jest.fn();

  const [action] = setup(clicked, settings);

  if (!isCustomClickAction(action)) {
    throw new Error("expected a custom click action");
  }
  action.onClick?.({ dispatch: jest.fn(), closePopover });

  return { writeText, closePopover };
};

describe("CopyValueAction", () => {
  const column = createMockColumn({ name: "NAME", display_name: "Name" });

  it("returns no actions when the column is missing", () => {
    expect(setup({ value: "hello" })).toHaveLength(0);
  });

  it("returns no actions on a header click (value is undefined)", () => {
    expect(setup({ column })).toHaveLength(0);
  });

  it("returns no actions on an empty cell (value is null)", () => {
    expect(setup({ column, value: null })).toHaveLength(0);
  });

  it("returns no actions on a primary key cell, so it still drills straight to the object detail view", () => {
    const pkColumn = createMockColumn({
      name: "ID",
      display_name: "ID",
      semantic_type: "type/PK",
    });

    expect(setup({ column: pkColumn, value: 42 })).toHaveLength(0);
  });

  it("returns no actions for clicks that group several rows, like the pie 'Other' slice (metabase#5334)", () => {
    const metricColumn = createMockNumericColumn({
      name: "count",
      display_name: "Count",
    });

    const actions = setup({
      column: metricColumn,
      value: 93,
      dimensions: [{ column, value: ["Doohickey", "Gizmo"] }],
    });

    expect(actions).toHaveLength(0);
  });

  it("returns an action on a foreign key cell", () => {
    const fkColumn = createMockColumn({
      name: "PRODUCT_ID",
      display_name: "Product ID",
      semantic_type: "type/FK",
    });

    expect(setup({ column: fkColumn, value: 42 })).toHaveLength(1);
  });

  it("returns a copy-value action for a cell with a value", () => {
    const actions = setup({ column, value: "hello" });
    const [action] = actions;

    expect(actions).toHaveLength(1);

    if (!isCustomClickAction(action)) {
      throw new Error("expected a custom click action");
    }

    expect(action.name).toBe("copy-value");
    expect(action.section).toBe("copy");
  });

  it("returns an action for falsy but present values (0, false, empty string)", () => {
    expect(setup({ column, value: 0 })).toHaveLength(1);
    expect(setup({ column, value: false })).toHaveLength(1);
    expect(setup({ column, value: "" })).toHaveLength(1);
  });

  it("copies the formatted value to the clipboard and closes the popover", () => {
    const { writeText, closePopover } = copyValue({ column, value: "hello" });

    expect(writeText).toHaveBeenCalledWith("hello");
    expect(closePopover).toHaveBeenCalledTimes(1);
  });

  describe("column settings", () => {
    const numericColumn = createMockNumericColumn({
      name: "DISCOUNT",
      display_name: "Discount",
    });

    it("copies the value formatted by the computed column settings", () => {
      const { writeText } = copyValue(
        { column: numericColumn, value: 0.8567 },
        {
          column: () => ({ prefix: "~", number_style: "percent", decimals: 1 }),
        },
      );

      expect(writeText).toHaveBeenCalledWith("~85.7%");
    });

    it("falls back to the saved column settings when there are no computed settings", () => {
      const { writeText } = copyValue(
        { column: numericColumn, value: 1234.5 },
        {
          column_settings: {
            [getColumnKey(numericColumn)]: { prefix: "$", decimals: 2 },
          },
        },
      );

      expect(writeText).toHaveBeenCalledWith("$1,234.50");
    });
  });
});
