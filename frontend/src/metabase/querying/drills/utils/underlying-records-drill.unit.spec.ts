import { addLocale, useLocale } from "ttag";

import type * as Lib from "metabase-lib";
import { SAMPLE_METADATA } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import { createMockCard } from "metabase-types/api/mocks";

import { underlyingRecordsDrill } from "./underlying-records-drill";

// underlyingRecordsDrill reads drillInfo/applyDrill, not the opaque Lib.DrillThru
// handle it is passed, so an empty stub suffices.
const STUB_DRILL = {} as Lib.DrillThru;
// likewise, the drill never reads the raw Lib.ClickObject.
const STUB_CLICKED = {} as Lib.ClickObject;

// A pivot table question whose viz settings should partially survive the drill:
// the pivot-specific flag must be cleared, but unrelated settings must be kept.
const PIVOT_SETTINGS = {
  "table.pivot": true,
  "table.pivot_column": "CATEGORY",
  "table.cell_column": "count",
  column_settings: {
    '["ref",["field",1,null]]': { column_title: "Vendor2" },
  },
};

function createPivotQuestion() {
  return new Question(
    createMockCard({ visualization_settings: PIVOT_SETTINGS }),
    SAMPLE_METADATA,
  );
}

function getDrilledQuestion(sourceQuestion: Question): Question {
  // applyDrill returns the source question (its query gets swapped in the real
  // flow, but the lingering pivot viz settings are what this drill must reset).
  const applyDrill = () => sourceQuestion;

  const [action] = underlyingRecordsDrill({
    question: sourceQuestion,
    query: sourceQuestion.query(),
    stageIndex: -1,
    drill: STUB_DRILL,
    drillInfo: {
      type: "drill-thru/underlying-records",
      rowCount: 1,
      tableName: "Products",
    },
    clicked: STUB_CLICKED,
    applyDrill,
  });

  if (!("question" in action) || typeof action.question !== "function") {
    throw new Error("expected a question-producing click action");
  }
  return action.question();
}

describe("underlyingRecordsDrill", () => {
  it("clears the pivot flag when drilling to underlying records (metabase#12368)", () => {
    const settings = getDrilledQuestion(createPivotQuestion()).settings();
    expect(settings["table.pivot"]).toBe(false);
  });

  it("switches the display to a plain table", () => {
    expect(getDrilledQuestion(createPivotQuestion()).display()).toBe("table");
  });

  it("preserves unrelated column settings across the drill (metabase#12368)", () => {
    const settings = getDrilledQuestion(createPivotQuestion()).settings();
    expect(settings.column_settings).toEqual(PIVOT_SETTINGS.column_settings);
  });
});

describe("underlyingRecordsDrill title translation (metabase#33079)", () => {
  // A translation catalog in which a plain singular `t`See this ${x}`` (e.g. from
  // a reference header) has already claimed the "See this ${ 0 }" message id with
  // only a singular form. The drill builds its title with ngettext; if it shares
  // that message id, the plural lookup dereferences a missing plural form and throws.
  // The fix appends an empty interpolation so the drill's msgid ("See this ${ 0 }${ 1 }")
  // can never collide with a singular-only translation.
  const CATALOG_WITH_SINGULAR_COLLISION = {
    headers: { "plural-forms": "nplurals=2; plural=(n != 1);" },
    translations: {
      "": {
        "See this ${ 0 }": {
          msgid: "See this ${ 0 }",
          msgstr: ["Diese ${ 0 } ansehen"],
        },
      },
    },
  };

  beforeEach(() => {
    addLocale("test-33079", CATALOG_WITH_SINGULAR_COLLISION);
    useLocale("test-33079");
  });

  afterEach(() => {
    addLocale("test-33079-reset", {
      headers: { "plural-forms": "nplurals=2; plural=(n != 1);" },
      translations: { "": { "": { msgid: "", msgstr: [""] } } },
    });
    useLocale("test-33079-reset");
  });

  function getDrillTitle(rowCount: number) {
    const question = new Question(createMockCard(), SAMPLE_METADATA);
    const [action] = underlyingRecordsDrill({
      question,
      query: question.query(),
      stageIndex: -1,
      drill: STUB_DRILL,
      drillInfo: {
        type: "drill-thru/underlying-records",
        rowCount,
        tableName: "Orders",
      },
      clicked: STUB_CLICKED,
      applyDrill: () => question,
    });
    return action.title;
  }

  it("builds a plural drill title without colliding with a singular translation (metabase#33079)", () => {
    expect(getDrillTitle(19)).toBe("See these Orders");
  });
});
