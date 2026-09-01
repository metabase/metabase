import { createMockMetadata } from "__support__/metadata";
import type {
  LegacyDrill,
  QueryClickActionsMode,
} from "metabase/visualizations/types";
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

  it("does not answer hasColumnShortcutActions, so the add-column shortcut stays off", () => {
    expect(getDefaultClickActionMode.hasColumnShortcutActions).toBeUndefined();
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

  describe("hasColumnShortcutActions", () => {
    const shortcutAction: LegacyDrill = ({ question }) => [
      {
        name: "column-shortcut",
        section: "new-column",
        buttonType: "horizontal",
        question: () => question,
      },
    ];

    it("passes the click through to the query mode's actions", () => {
      const getter = queryModeToClickActionMode(queryMode);
      const props = {
        question: createQuestion(),
        clicked: { columnShortcuts: true },
      };
      getter.hasColumnShortcutActions?.(props);
      expect(clickAction).toHaveBeenCalledWith(props);
    });

    it("answers true when an action offers something for the click", () => {
      const getter = queryModeToClickActionMode({
        ...queryMode,
        clickActions: [clickAction, shortcutAction],
      });
      const props = {
        question: createQuestion(),
        clicked: { columnShortcuts: true },
      };
      expect(getter.hasColumnShortcutActions?.(props)).toBe(true);
    });

    it("answers false when every action comes back empty", () => {
      const getter = queryModeToClickActionMode(queryMode);
      const props = {
        question: createQuestion(),
        clicked: { columnShortcuts: true },
      };
      expect(getter.hasColumnShortcutActions?.(props)).toBe(false);
    });

    it("answers false when the query mode has no actions at all", () => {
      const getter = queryModeToClickActionMode({
        ...queryMode,
        clickActions: [],
      });
      const props = {
        question: createQuestion(),
        clicked: { columnShortcuts: true },
      };
      expect(getter.hasColumnShortcutActions?.(props)).toBe(false);
    });
  });
});
