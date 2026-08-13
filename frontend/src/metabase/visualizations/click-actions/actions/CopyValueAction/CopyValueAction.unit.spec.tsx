import { createMockMetadata } from "__support__/metadata";
import {
  type ClickObject,
  isCustomClickAction,
} from "metabase/visualizations/types";
import Question from "metabase-lib/v1/Question";
import { createMockColumn } from "metabase-types/api/mocks";
import {
  createSampleDatabase,
  createSavedStructuredCard,
} from "metabase-types/api/mocks/presets";

import { CopyValueAction } from "./CopyValueAction";

const setup = (clicked: ClickObject | undefined) => {
  const metadata = createMockMetadata({
    databases: [createSampleDatabase()],
  });
  const question = new Question(createSavedStructuredCard(), metadata);
  return CopyValueAction({ question, clicked, settings: {} });
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

  it("returns a copy-value action for a cell with a value", () => {
    const actions = setup({ column, value: "hello" });

    expect(actions).toHaveLength(1);
    expect(actions[0].name).toBe("copy-value");
    expect(actions[0].section).toBe("copy");
  });

  it("returns an action for falsy but present values (0, false, empty string)", () => {
    expect(setup({ column, value: 0 })).toHaveLength(1);
    expect(setup({ column, value: false })).toHaveLength(1);
    expect(setup({ column, value: "" })).toHaveLength(1);
  });

  it("copies the formatted value to the clipboard and closes the popover", () => {
    const writeTextMock = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });
    const closePopover = jest.fn();

    const [action] = setup({ column, value: "hello" });

    if (!isCustomClickAction(action)) {
      throw new Error("expected a custom click action");
    }
    action.onClick?.({ dispatch: jest.fn(), closePopover });

    expect(writeTextMock).toHaveBeenCalledWith("hello");
    expect(closePopover).toHaveBeenCalledTimes(1);
  });
});
