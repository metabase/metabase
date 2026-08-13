import { createMockMetadata } from "__support__/metadata";
import type { QueryClickActionsMode } from "metabase/visualizations/types";
import Question from "metabase-lib/v1/Question";
import type { Card } from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks";

import { Mode } from "../Mode";
import { ArchivedMode } from "../modes/ArchivedMode";
import { DefaultMode } from "../modes/DefaultMode";
import { ListMode } from "../modes/ListMode";

import {
  getDefaultClickActionMode,
  getMode,
  queryModeToClickActionMode,
} from "./modes";

const metadata = createMockMetadata({});

function createQuestion(card: Partial<Card> = {}) {
  return new Question(createMockCard(card), metadata);
}

describe("getMode", () => {
  it("returns ArchivedMode for an archived question", () => {
    const mode = getMode(createQuestion({ archived: true }));
    expect(mode.queryMode()).toBe(ArchivedMode);
  });

  it("returns ListMode for a list question", () => {
    const mode = getMode(createQuestion({ display: "list" }));
    expect(mode.queryMode()).toBe(ListMode);
  });

  it("returns DefaultMode for other questions", () => {
    const mode = getMode(createQuestion());
    expect(mode.queryMode()).toBe(DefaultMode);
  });
});

describe("getDefaultClickActionMode", () => {
  it("resolves the stock mode for the given question", () => {
    const mode = getDefaultClickActionMode({ question: createQuestion() });
    if (!(mode instanceof Mode)) {
      throw new Error("expected a Mode instance");
    }
    expect(mode.queryMode()).toBe(DefaultMode);
  });
});

describe("queryModeToClickActionMode", () => {
  const clickAction = jest.fn(() => []);
  const queryMode: QueryClickActionsMode = {
    name: "test",
    hasDrills: false,
    clickActions: [clickAction],
  };

  beforeEach(() => {
    clickAction.mockClear();
  });

  it("wraps the question passed at click time", () => {
    const getter = queryModeToClickActionMode(queryMode);
    const question = createQuestion();
    getter({ question }).actionsForClick({}, {});
    expect(clickAction).toHaveBeenCalledWith(
      expect.objectContaining({ question }),
    );
  });

  it("advertises the query mode's clickActions for hosts that probe them", () => {
    const getter = queryModeToClickActionMode(queryMode);
    expect(getter.clickActions).toBe(queryMode.clickActions);
  });
});
