import { checkNotNull } from "metabase/utils/types";
import {
  type ClickAction,
  type ClickObject,
  isCustomClickAction,
} from "metabase/visualizations/types";
import * as Lib from "metabase-lib";
import {
  SAMPLE_METADATA,
  SAMPLE_PROVIDER,
  columnFinder,
} from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import {
  createMockCard,
  createMockColumn,
  createMockNumericColumn,
} from "metabase-types/api/mocks";
import { PEOPLE, PEOPLE_ID } from "metabase-types/api/mocks/presets";

import {
  getDrillDimensions,
  getMcpClickActions,
  isMcpChartChanging,
} from "./clickActions";

const CARD = createMockCard();
const NOT_BUSY = () => false;
const CLICKED: ClickObject = {
  column: createMockNumericColumn({ name: "PRICE" }),
};

const questionAction = (name: string): ClickAction => ({
  name,
  section: "sort",
  buttonType: "sort",
  question: () => new Question(CARD),
});

describe("getMcpClickActions", () => {
  it("turns a drill the server can derive into an action that hands it the operation", () => {
    const onDrill = jest.fn();
    const [action] = getMcpClickActions(
      [questionAction("sort.descending")],
      CLICKED,
      onDrill,
      NOT_BUSY,
      {},
    );

    expect(action.name).toBe("sort.descending");
    expect(action).not.toHaveProperty("question");

    if (!isCustomClickAction(action) || !action.onClick) {
      throw new Error("expected a custom action with an onClick");
    }

    const closePopover = jest.fn();
    action.onClick({ dispatch: jest.fn(), closePopover });

    expect(closePopover).toHaveBeenCalled();
    expect(onDrill).toHaveBeenCalledWith(
      {
        type: "drill-thru",
        drill: "sort",
        direction: "desc",
        context: { column: "PRICE", row: [], dimensions: [] },
      },
      expect.objectContaining({ id: CARD.id }),
    );
  });

  it("drops actions that would run a query built on the client", () => {
    const popoverAction: ClickAction = {
      name: "column-filter",
      section: "filter",
      buttonType: "horizontal",
      popover: () => <div />,
    };

    expect(
      getMcpClickActions(
        [questionAction("combine"), popoverAction],
        CLICKED,
        jest.fn(),
        NOT_BUSY,
        {},
      ),
    ).toEqual([]);
  });

  it("keeps a drill the default action, so a PK or FK click runs it without a popover", () => {
    const pkAction: ClickAction = {
      ...questionAction("pk"),
      section: "details",
      default: true,
    };
    const [action] = getMcpClickActions(
      [pkAction],
      CLICKED,
      jest.fn(),
      NOT_BUSY,
      {},
    );

    expect(action).toMatchObject({ name: "pk", default: true });
    expect(
      getMcpClickActions(
        [questionAction("sort.ascending")],
        CLICKED,
        jest.fn(),
        NOT_BUSY,
        {},
      )[0],
    ).not.toHaveProperty("default");
  });

  it("keeps actions that leave the query alone", () => {
    const hideColumn: ClickAction = {
      ...questionAction("hide-column"),
      questionChangeBehavior: "updateQuestion",
    };
    const urlAction: ClickAction = {
      name: "link",
      section: "auto",
      buttonType: "horizontal",
      url: () => "https://example.com",
    };

    expect(
      getMcpClickActions(
        [hideColumn, urlAction],
        CLICKED,
        jest.fn(),
        NOT_BUSY,
        {},
      ),
    ).toEqual([hideColumn, urlAction]);
  });

  it("offers no drill while the chart is changing, and offers them again after", () => {
    const hideColumn: ClickAction = {
      ...questionAction("hide-column"),
      questionChangeBehavior: "updateQuestion",
    };
    const actions = [questionAction("sort.ascending"), hideColumn];
    let busy = true;
    const isBusy = () => busy;

    // A drill's click comes from the results on screen, which a pending change
    // or a running query is about to replace.
    expect(
      getMcpClickActions(actions, CLICKED, jest.fn(), isBusy, {}).map(
        (action) => action.name,
      ),
    ).toEqual(["hide-column"]);

    busy = false;

    expect(
      getMcpClickActions(actions, CLICKED, jest.fn(), isBusy, {}).map(
        (action) => action.name,
      ),
    ).toEqual(["sort.ascending", "hide-column"]);
  });
});

describe("getMcpClickActions with a drill offered per dimension", () => {
  it("names the dimension each zoom acts on, so two zooms send different dimensions", () => {
    const onDrill = jest.fn();
    const zoom = (): ClickAction => ({
      ...questionAction("zoom-in.binning"),
      section: "zoom",
    });
    const actions = getMcpClickActions(
      [zoom(), zoom()],
      CLICKED,
      onDrill,
      NOT_BUSY,
      { "zoom-in.binning": ["SUBTOTAL", "TOTAL"] },
    );

    for (const action of actions) {
      if (!isCustomClickAction(action) || !action.onClick) {
        throw new Error("expected a custom action with an onClick");
      }
      action.onClick({ dispatch: jest.fn(), closePopover: jest.fn() });
    }

    expect(
      onDrill.mock.calls.map(([operation]) => operation.dimension),
    ).toEqual(["SUBTOTAL", "TOTAL"]);
  });

  it("sends no dimension for a drill offered once", () => {
    const onDrill = jest.fn();
    const [action] = getMcpClickActions(
      [questionAction("sort.ascending")],
      CLICKED,
      onDrill,
      NOT_BUSY,
      {},
    );

    if (!isCustomClickAction(action) || !action.onClick) {
      throw new Error("expected a custom action with an onClick");
    }
    action.onClick({ dispatch: jest.fn(), closePopover: jest.fn() });

    expect(onDrill.mock.calls[0][0]).not.toHaveProperty("dimension");
  });
});

describe("isMcpChartChanging", () => {
  it("is true while a derive is pending or the query runs, and false once both finish", () => {
    const pendingDerives = { current: 0 };
    const isQueryRunning = { current: false };

    expect(isMcpChartChanging(pendingDerives, isQueryRunning)).toBe(false);

    pendingDerives.current = 1;
    expect(isMcpChartChanging(pendingDerives, isQueryRunning)).toBe(true);

    pendingDerives.current = 0;
    isQueryRunning.current = true;
    expect(isMcpChartChanging(pendingDerives, isQueryRunning)).toBe(true);

    isQueryRunning.current = false;
    expect(isMcpChartChanging(pendingDerives, isQueryRunning)).toBe(false);
  });
});

describe("getDrillDimensions", () => {
  it("names the dimension of each geographic zoom a two-dimension point offers", () => {
    const base = Lib.aggregateByCount(
      Lib.queryFromTableOrCardMetadata(
        SAMPLE_PROVIDER,
        checkNotNull(Lib.tableOrCardMetadata(SAMPLE_PROVIDER, PEOPLE_ID)),
      ),
      -1,
    );
    const breakout = (query: Lib.Query, columnName: string) =>
      Lib.breakout(
        query,
        -1,
        columnFinder(query, Lib.breakoutableColumns(query, -1))(
          "PEOPLE",
          columnName,
        ),
      );
    const query = breakout(breakout(base, "STATE"), "CITY");
    const question = new Question(
      createMockCard({ id: undefined, dataset_query: Lib.toJsQuery(query) }),
      SAMPLE_METADATA,
    );
    const dimension = (name: string, id: number, semantic_type: string) =>
      createMockColumn({
        name,
        display_name: name,
        source: "breakout",
        base_type: "type/Text",
        semantic_type,
        id,
        table_id: PEOPLE_ID,
        field_ref: ["field", id, null],
      });

    expect(
      getDrillDimensions(question, {
        column: createMockNumericColumn({
          name: "count",
          source: "aggregation",
          field_ref: ["aggregation", 0],
        }),
        value: 3,
        dimensions: [
          {
            column: dimension("STATE", PEOPLE.STATE, "type/State"),
            value: "TX",
          },
          {
            column: dimension("CITY", PEOPLE.CITY, "type/City"),
            value: "Austin",
          },
        ],
      }),
    ).toEqual({ "zoom-in.geographic": ["STATE", "CITY"] });
  });

  it("names no dimension for the binned lat/lon zoom, which acts on both coordinates", () => {
    const base = Lib.aggregateByCount(
      Lib.queryFromTableOrCardMetadata(
        SAMPLE_PROVIDER,
        checkNotNull(Lib.tableOrCardMetadata(SAMPLE_PROVIDER, PEOPLE_ID)),
      ),
      -1,
    );
    const binnedBreakout = (query: Lib.Query, columnName: string) => {
      const column = columnFinder(query, Lib.breakoutableColumns(query, -1))(
        "PEOPLE",
        columnName,
      );
      const [strategy] = Lib.availableBinningStrategies(query, -1, column);
      return Lib.breakout(query, -1, Lib.withBinning(column, strategy));
    };
    const query = binnedBreakout(binnedBreakout(base, "LATITUDE"), "LONGITUDE");
    const question = new Question(
      createMockCard({ id: undefined, dataset_query: Lib.toJsQuery(query) }),
      SAMPLE_METADATA,
    );
    const coordinate = (name: string, id: number, semantic_type: string) =>
      createMockColumn({
        name,
        display_name: name,
        source: "breakout",
        base_type: "type/Float",
        semantic_type,
        id,
        table_id: PEOPLE_ID,
        binning_info: { binning_strategy: "bin-width", bin_width: 10 },
        field_ref: [
          "field",
          id,
          { binning: { strategy: "bin-width", "bin-width": 10 } },
        ],
      });
    const clicked = {
      column: createMockNumericColumn({
        name: "count",
        source: "aggregation",
        field_ref: ["aggregation", 0],
      }),
      value: 3,
      dimensions: [
        {
          column: coordinate("LATITUDE", PEOPLE.LATITUDE, "type/Latitude"),
          value: 30,
        },
        {
          column: coordinate("LONGITUDE", PEOPLE.LONGITUDE, "type/Longitude"),
          value: -100,
        },
      ],
    };

    const offered = Lib.availableDrillThrus(
      question.query(),
      -1,
      undefined,
      clicked.column,
      clicked.value,
      undefined,
      clicked.dimensions,
    ).map((drill) => Lib.displayInfo(question.query(), -1, drill).type);
    expect(offered).toContain("drill-thru/zoom-in.geographic");

    expect(getDrillDimensions(question, clicked)).toEqual({
      "zoom-in.geographic": [null],
    });
  });
});
