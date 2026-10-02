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

import { getMcpClickActions } from "./clickActions";

const CARD = createMockCard();
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
      getMcpClickActions([hideColumn, urlAction], CLICKED, jest.fn()),
    ).toEqual([hideColumn, urlAction]);
  });
});
