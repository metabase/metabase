import {
  type ClickAction,
  type ClickObject,
  isCustomClickAction,
} from "metabase/visualizations/types";
import Question from "metabase-lib/v1/Question";
import {
  createMockCard,
  createMockNumericColumn,
} from "metabase-types/api/mocks";

import { getMcpClickActions, isMcpChartChanging } from "./clickActions";

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
      ),
    ).toEqual([]);
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
      getMcpClickActions([hideColumn, urlAction], CLICKED, jest.fn(), NOT_BUSY),
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
      getMcpClickActions(actions, CLICKED, jest.fn(), isBusy).map(
        (action) => action.name,
      ),
    ).toEqual(["hide-column"]);

    busy = false;

    expect(
      getMcpClickActions(actions, CLICKED, jest.fn(), isBusy).map(
        (action) => action.name,
      ),
    ).toEqual(["sort.ascending", "hide-column"]);
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
