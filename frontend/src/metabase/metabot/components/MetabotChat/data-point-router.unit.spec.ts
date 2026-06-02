import type { Dataset } from "metabase-types/api";

import type { DataPointMentionTarget } from "./data-point-mentions";
import {
  type DataPointCard,
  nextDataPointCardMountOrder,
  registerDataPointCard,
  routeDataPointMention,
  setDataPointOnDemandHandler,
} from "./data-point-router";

const makeResult = (cols: { name: string }[], rows: unknown[][]): Dataset =>
  ({
    data: {
      cols: cols.map((c) => ({ ...c, base_type: "type/Text" })),
      rows,
    },
  }) as unknown as Dataset;

const ordersResult = makeResult(
  [{ name: "ID" }, { name: "NAME" }, { name: "TOTAL" }],
  [
    [1, "Ada", 10],
    [2, "Grace", 20],
  ],
);

// A different query: aggregation that shares only NAME + TOTAL with the orders chart.
const aggregationResult = makeResult(
  [{ name: "NAME" }, { name: "TOTAL" }],
  [
    ["Ada", 10],
    ["Grace", 20],
  ],
);

const makeCard = (
  id: string,
  result: Dataset | null,
  mountedAt = nextDataPointCardMountOrder(),
): { card: DataPointCard; highlight: jest.Mock; scroll: jest.Mock } => {
  const highlight = jest.fn();
  const scroll = jest.fn();
  return {
    highlight,
    scroll,
    card: {
      id,
      mountedAt,
      getResult: () => result,
      highlight,
      scrollIntoView: scroll,
    },
  };
};

describe("routeDataPointMention", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    cleanups.forEach((fn) => fn());
    cleanups.length = 0;
  });

  const register = (card: DataPointCard) => {
    cleanups.push(registerDataPointCard(card));
  };

  it("routes to the card holding the exact row", () => {
    const a = makeCard("a", null);
    const b = makeCard("b", ordersResult);
    register(a.card);
    register(b.card);

    const target: DataPointMentionTarget = {
      columns: ["ID", "NAME", "TOTAL"],
      row: [2, "Grace", 20],
      value_column_index: 2,
    };

    expect(routeDataPointMention(target)).toBe(true);
    expect(b.highlight).toHaveBeenCalledTimes(1);
    expect(b.scroll).toHaveBeenCalledTimes(1);
    expect(a.highlight).not.toHaveBeenCalled();
    expect(b.highlight.mock.calls[0][0].value).toBe(20);
  });

  it("falls back to the best-fitting card when no exact row matches", () => {
    // The orders card can't match (different row arity), but the aggregation
    // card shares NAME + TOTAL and has a unique matching row.
    const orders = makeCard("orders", ordersResult);
    const agg = makeCard("agg", aggregationResult);
    register(orders.card);
    register(agg.card);

    const target: DataPointMentionTarget = {
      columns: ["NAME", "TOTAL"],
      row: ["Ada", 10],
      value_column_index: 1,
    };

    expect(routeDataPointMention(target)).toBe(true);
    expect(agg.highlight).toHaveBeenCalledTimes(1);
    expect(agg.highlight.mock.calls[0][0].value).toBe(10);
  });

  it("renders the source on demand when nothing on screen resolves the point", () => {
    const empty = makeCard("empty", null);
    register(empty.card);

    const onDemand = jest.fn();
    cleanups.push(setDataPointOnDemandHandler(onDemand));

    const target: DataPointMentionTarget = {
      columns: ["NAME", "TOTAL"],
      row: ["Nobody", 99],
      value_column_index: 1,
      source: { type: "query", id: "q1", question_url: "/question#abc" },
    };

    expect(routeDataPointMention(target)).toBe(true);
    expect(onDemand).toHaveBeenCalledWith(target, undefined);
    expect(empty.highlight).not.toHaveBeenCalled();
  });

  it("returns false when nothing can resolve and there is no source", () => {
    const target: DataPointMentionTarget = {
      columns: ["NAME"],
      row: ["Nobody"],
      value_column_index: 0,
    };
    expect(routeDataPointMention(target)).toBe(false);
  });

  it("re-highlights a card that owns the clicked mention id", () => {
    const owner = makeCard("owner", null);
    const resolveMentionId = jest.fn((id) => id === "mention-7");
    register({ ...owner.card, resolveMentionId });

    expect(routeDataPointMention(undefined, "mention-7")).toBe(true);
    expect(resolveMentionId).toHaveBeenCalledWith("mention-7");
  });
});
