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

import { getQueryMode } from "./modes";

const metadata = createMockMetadata({});

function createQuestion(card: Partial<Card> = {}) {
  return new Question(createMockCard(card), metadata);
}

describe("getQueryMode", () => {
  it("should return ArchivedMode for an archived question", () => {
    expect(getQueryMode(createQuestion({ archived: true }))).toBe(ArchivedMode);
  });

  it("should return ListMode for a list question", () => {
    expect(getQueryMode(createQuestion({ display: "list" }))).toBe(ListMode);
  });

  it("should return DefaultMode for other questions", () => {
    expect(getQueryMode(createQuestion())).toBe(DefaultMode);
  });
});

describe("Mode", () => {
  const clickAction = jest.fn(() => []);
  const queryMode: QueryClickActionsMode = {
    name: "test",
    hasDrills: false,
    clickActions: [clickAction],
  };

  beforeEach(() => {
    clickAction.mockClear();
  });

  it("should resolve the query mode from the click-time question", () => {
    const chooseQueryMode = jest.fn(() => queryMode);
    const mode = new Mode(chooseQueryMode);
    const question = createQuestion();
    mode.actionsForClick({}, { question });
    expect(chooseQueryMode).toHaveBeenCalledWith(question);
    expect(clickAction).toHaveBeenCalledWith(
      expect.objectContaining({ question }),
    );
  });

  it("should resolve no actions without a question", () => {
    const mode = new Mode(() => queryMode);
    expect(mode.actionsForClick({})).toEqual([]);
    expect(clickAction).not.toHaveBeenCalled();
  });

  describe("hasColumnShortcutActions", () => {
    const props = {
      question: createQuestion(),
      clicked: { columnShortcuts: true },
    };
    const shortcutAction: LegacyDrill = ({ question }) => [
      {
        name: "column-shortcut",
        section: "new-column",
        buttonType: "horizontal",
        question: () => question,
      },
    ];

    it("should not be defined unless opted in, so the add-column shortcut stays off", () => {
      const mode = new Mode(() => queryMode);
      expect(mode.hasColumnShortcutActions).toBeUndefined();
    });

    it("should pass the click through to the query mode's actions", () => {
      const mode = new Mode(() => queryMode, {
        hasColumnShortcutActions: true,
      });
      mode.hasColumnShortcutActions?.(props);
      expect(clickAction).toHaveBeenCalledWith(props);
    });

    it("should answer true when an action offers something for the click", () => {
      const mode = new Mode(
        () => ({ ...queryMode, clickActions: [clickAction, shortcutAction] }),
        { hasColumnShortcutActions: true },
      );
      expect(mode.hasColumnShortcutActions?.(props)).toBe(true);
    });

    it("should answer false when every action comes back empty", () => {
      const mode = new Mode(() => queryMode, {
        hasColumnShortcutActions: true,
      });
      expect(mode.hasColumnShortcutActions?.(props)).toBe(false);
    });

    it("should answer false when the query mode has no actions at all", () => {
      const mode = new Mode(() => ({ ...queryMode, clickActions: [] }), {
        hasColumnShortcutActions: true,
      });
      expect(mode.hasColumnShortcutActions?.(props)).toBe(false);
    });
  });
});
