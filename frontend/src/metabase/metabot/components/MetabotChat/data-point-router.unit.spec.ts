import type { Dataset } from "metabase-types/api";

import type { DataPointMentionTarget } from "./data-point-mentions";
import {
  type DataPointCard,
  isQuestionLikeHref,
  nextDataPointCardMountOrder,
  normalizeQuestionLink,
  registerDataPointCard,
  resolveChartCardForLink,
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

describe("normalizeQuestionLink", () => {
  it("keys adhoc question urls by their hash", () => {
    expect(normalizeQuestionLink("/question#abc123")).toBe("hash:abc123");
  });

  it("keys absolute adhoc question urls by their hash", () => {
    expect(normalizeQuestionLink("http://localhost:3000/question#abc123")).toBe(
      "hash:abc123",
    );
  });

  it("keys saved question routes by id", () => {
    expect(normalizeQuestionLink("/question/42")).toBe("id:42");
    expect(normalizeQuestionLink("/question/42-revenue")).toBe("id:42");
  });

  it("keys metabase protocol question links by id", () => {
    expect(normalizeQuestionLink("metabase://question/42")).toBe("id:42");
  });

  it("returns undefined for non-question links", () => {
    expect(normalizeQuestionLink("/dashboard/1")).toBeUndefined();
    expect(normalizeQuestionLink("https://example.com")).toBeUndefined();
    expect(normalizeQuestionLink(undefined)).toBeUndefined();
  });
});

describe("isQuestionLikeHref", () => {
  it.each([
    "/question",
    "/question#hash",
    "/question/42",
    "http://localhost:3000/question#hash",
    "metabase://question/42",
  ])("is true for %s", (href) => {
    expect(isQuestionLikeHref(href)).toBe(true);
  });

  it.each(["/dashboard/1", "https://example.com", undefined])(
    "is false for %s",
    (href) => {
      expect(isQuestionLikeHref(href)).toBe(false);
    },
  );
});

describe("resolveChartCardForLink", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    cleanups.forEach((fn) => fn());
    cleanups.length = 0;
  });

  const registerChart = (overrides: Partial<DataPointCard>): DataPointCard => {
    const card: DataPointCard = {
      id: `chart_${overrides.questionKey ?? Math.random()}`,
      mountedAt: nextDataPointCardMountOrder(),
      getResult: () => null,
      highlight: jest.fn(),
      scrollIntoView: jest.fn(),
      flash: jest.fn(),
      ...overrides,
    };
    cleanups.push(registerDataPointCard(card));
    return card;
  };

  it("matches a card by question identity, even via an absolute url", () => {
    const card = registerChart({
      questionKey: "hash:abc",
      questionName: "Revenue",
    });

    expect(
      resolveChartCardForLink("http://localhost/question#abc", "anything"),
    ).toBe(card);
  });

  it("falls back to matching a question link by its label", () => {
    // The link's identity (a saved id) differs from the embed's (an adhoc
    // hash), but the label is the chart's title.
    const card = registerChart({
      questionKey: "hash:xyz",
      questionName: "Year-over-Year Revenue",
    });

    expect(
      resolveChartCardForLink(
        "metabase://question/99",
        "Year-over-Year Revenue",
      ),
    ).toBe(card);
  });

  it("does not let the title fallback hijack a non-question link", () => {
    registerChart({ questionKey: "hash:only", questionName: "Shared Name" });

    expect(
      resolveChartCardForLink("https://example.com/report", "Shared Name"),
    ).toBeUndefined();
  });

  it("prefers the most recently mounted matching card", () => {
    registerChart({ questionKey: "hash:dup", questionName: "Dup" });
    const newer = registerChart({
      questionKey: "hash:dup",
      questionName: "Dup",
    });

    expect(resolveChartCardForLink("/question#dup", "Dup")).toBe(newer);
  });

  it("returns undefined when nothing matches", () => {
    expect(
      resolveChartCardForLink("/question#missing", "Nope"),
    ).toBeUndefined();
  });
});
