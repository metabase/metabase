import { createMockMetadata } from "__support__/metadata";
import type * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import { createMockCard, createMockDashboard } from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { zoomInBinningDrill } from "./zoom-in-binning-drill";

const metadata = createMockMetadata({ databases: [createSampleDatabase()] });

// A binned-numeric count question displayed as a line chart. Its query's
// default display is "bar", so setDefaultDisplay() would change it away from
// "line" — letting us tell "locked" apart from "reset to default".
function createLineBinnedQuestion() {
  return new Question(
    createMockCard({
      dataset_query: {
        database: SAMPLE_DB_ID,
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [
            ["field", ORDERS.TOTAL, { binning: { strategy: "default" } }],
          ],
        },
      },
      display: "line",
    }),
    metadata,
  );
}

function getDrilledQuestion(
  sourceQuestion: Question,
  { fromDashboard }: { fromDashboard: boolean },
): Question {
  const applyDrill = () => sourceQuestion;
  const clicked = {
    extraData: fromDashboard ? { dashboard: createMockDashboard() } : {},
  } as Lib.ClickObject;

  const [action] = zoomInBinningDrill({
    question: sourceQuestion,
    query: sourceQuestion.query(),
    stageIndex: -1,
    drill: {} as Lib.DrillThru,
    drillInfo: {
      type: "drill-thru/zoom-in.binning",
    } as Lib.ZoomDrillThruInfo,
    clicked,
    applyDrill,
  });

  if (!("question" in action) || typeof action.question !== "function") {
    throw new Error("expected a question-producing click action");
  }
  return action.question();
}

describe("zoomInBinningDrill", () => {
  it("keeps the card's display when the zoom drill comes from a dashboard (metabase#38307)", () => {
    const question = getDrilledQuestion(createLineBinnedQuestion(), {
      fromDashboard: true,
    });

    expect(question.display()).toBe("line");
    expect(question.displayIsLocked()).toBe(true);
  });

  it("resets to the default display when not drilling from a dashboard", () => {
    const question = getDrilledQuestion(createLineBinnedQuestion(), {
      fromDashboard: false,
    });

    expect(question.display()).toBe("bar");
    expect(question.displayIsLocked()).toBe(false);
  });
});
