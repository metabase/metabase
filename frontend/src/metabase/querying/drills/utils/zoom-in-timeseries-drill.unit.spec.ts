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

import { zoomInTimeseriesDrill } from "./zoom-in-timeseries-drill";

const metadata = createMockMetadata({ databases: [createSampleDatabase()] });

// A time-series count question displayed as a bar chart. Its query's default
// display is "line", so setDefaultDisplay() would change it away from "bar" —
// which lets us tell "locked" apart from "reset to default".
function createBarTimeseriesQuestion() {
  return new Question(
    createMockCard({
      dataset_query: {
        database: SAMPLE_DB_ID,
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
          ],
        },
      },
      display: "bar",
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

  const [action] = zoomInTimeseriesDrill({
    question: sourceQuestion,
    query: sourceQuestion.query(),
    stageIndex: -1,
    drill: {} as Lib.DrillThru,
    drillInfo: {
      type: "drill-thru/zoom-in.timeseries",
      displayName: "See this month by week",
    } as Lib.ZoomTimeseriesDrillThruInfo,
    clicked,
    applyDrill,
  });

  if (!("question" in action) || typeof action.question !== "function") {
    throw new Error("expected a question-producing click action");
  }
  return action.question();
}

describe("zoomInTimeseriesDrill", () => {
  it("keeps the card's display when the zoom drill comes from a dashboard (metabase#38307)", () => {
    const question = getDrilledQuestion(createBarTimeseriesQuestion(), {
      fromDashboard: true,
    });

    expect(question.display()).toBe("bar");
    expect(question.displayIsLocked()).toBe(true);
  });

  it("resets to the default display when not drilling from a dashboard", () => {
    const question = getDrilledQuestion(createBarTimeseriesQuestion(), {
      fromDashboard: false,
    });

    expect(question.display()).toBe("line");
    expect(question.displayIsLocked()).toBe(false);
  });
});
