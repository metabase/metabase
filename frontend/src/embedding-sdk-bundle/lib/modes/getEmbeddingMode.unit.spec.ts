import { createMockMetadata } from "__support__/metadata";
import type { QueryClickActionsMode } from "metabase/querying/click-actions/types";
import type { ClickAction } from "metabase/visualizations/types";
import Question from "metabase-lib/v1/Question";
import { createMockCard } from "metabase-types/api/mocks";

import { getEmbeddingMode } from "./getEmbeddingMode";

const question = new Question(createMockCard(), createMockMetadata({}));

const action: ClickAction = {
  name: "stock",
  section: "auto",
  buttonType: "horizontal",
  question: () => question,
};

const queryMode: QueryClickActionsMode = {
  name: "test",
  hasDrills: false,
  clickActions: [() => [action]],
};

describe("getEmbeddingMode", () => {
  it("should resolve the query mode's actions without a plugin", () => {
    const mode = getEmbeddingMode({ queryMode });
    expect(mode.actionsForClick({}, { question })).toEqual([action]);
  });

  it("should hand the actions and the transformed click to the plugin", () => {
    const mapQuestionClickActions = jest.fn(() => []);
    const mode = getEmbeddingMode({
      queryMode,
      plugins: { mapQuestionClickActions },
    });
    const clicked = { value: 42 };

    expect(mode.actionsForClick(clicked, { question })).toEqual([]);
    expect(mapQuestionClickActions).toHaveBeenCalledWith(
      [action],
      expect.objectContaining({ value: 42, raw: clicked }),
    );
  });

  it("should turn a single onClick object into one default action", () => {
    const onClick = jest.fn();
    const mode = getEmbeddingMode({
      queryMode,
      plugins: { mapQuestionClickActions: () => ({ onClick }) },
    });

    expect(mode.actionsForClick({}, { question })).toEqual([
      {
        default: true,
        section: "auto",
        type: "custom",
        buttonType: "horizontal",
        name: "default",
        onClick,
      },
    ]);
  });

  it("should warn and keep the actions when the plugin returns neither", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const mode = getEmbeddingMode({
      queryMode,
      plugins: {
        mapQuestionClickActions: jest.fn().mockReturnValue({ title: "nope" }),
      },
    });

    expect(mode.actionsForClick({}, { question })).toEqual([action]);
    expect(warn).toHaveBeenCalledWith(
      "mapQuestionClickActions should return an array of actions, or a single object with a `onClick` property",
    );
    warn.mockRestore();
  });
});
