import { createMockMetadata } from "__support__/metadata";
import type { ClickAction, LegacyDrill } from "metabase/visualizations/types";
import Question from "metabase-lib/v1/Question";
import type { Card } from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks";

import { Mode } from "../Mode";
import { ArchivedMode } from "../modes/ArchivedMode";
import { DefaultMode } from "../modes/DefaultMode";
import { ListMode } from "../modes/ListMode";
import type { QueryClickActionsMode } from "../types";

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

  it("should choose the query mode from the clicked question", () => {
    const chooseQueryMode = jest.fn(() => queryMode);
    const mode = new Mode(chooseQueryMode);
    const question = createQuestion();
    mode.actionsForClick({}, { question });
    expect(chooseQueryMode).toHaveBeenCalledWith(question);
    expect(clickAction).toHaveBeenCalledWith(
      expect.objectContaining({ question }),
    );
  });

  it("should return no actions without a question", () => {
    const mode = new Mode(() => queryMode);
    expect(mode.actionsForClick({})).toEqual([]);
    expect(clickAction).not.toHaveBeenCalled();
  });

  it("should return the actions mapped by mapActions", () => {
    const mapped: ClickAction[] = [];
    const mapActions = jest.fn(() => mapped);
    const mode = new Mode(() => queryMode, { mapActions });
    const question = createQuestion();
    const clicked = { value: 1 };
    expect(mode.actionsForClick(clicked, { question })).toBe(mapped);
    expect(mapActions).toHaveBeenCalledWith([], clicked, question);
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

    it("should be undefined unless opted in", () => {
      const mode = new Mode(() => queryMode);
      expect(mode.hasColumnShortcutActions).toBeUndefined();
    });

    it("should call the query mode's actions with the click", () => {
      const mode = new Mode(() => queryMode, {
        hasColumnShortcutActions: true,
      });
      mode.hasColumnShortcutActions?.(props);
      expect(clickAction).toHaveBeenCalledWith(props);
    });

    it("should return true when an action returns something", () => {
      const mode = new Mode(
        () => ({ ...queryMode, clickActions: [clickAction, shortcutAction] }),
        { hasColumnShortcutActions: true },
      );
      expect(mode.hasColumnShortcutActions?.(props)).toBe(true);
    });

    it("should return false when every action returns nothing", () => {
      const mode = new Mode(() => queryMode, {
        hasColumnShortcutActions: true,
      });
      expect(mode.hasColumnShortcutActions?.(props)).toBe(false);
    });

    it("should return false when the query mode has no actions", () => {
      const mode = new Mode(() => ({ ...queryMode, clickActions: [] }), {
        hasColumnShortcutActions: true,
      });
      expect(mode.hasColumnShortcutActions?.(props)).toBe(false);
    });
  });
});
