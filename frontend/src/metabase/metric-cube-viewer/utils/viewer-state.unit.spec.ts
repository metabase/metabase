import type {
  CardGenerator,
  CubeCard,
  CubeCatalog,
  CubeCoarseSettings,
  CubeDimension,
  CubeMeasure,
} from "../generators/types";
import type {
  CubeDimensionFilter,
  CubeFilters,
  CubeViewerState,
} from "../types";

import {
  addCard,
  applyCoarseSettings,
  getInitialCubeViewerState,
  isDisplayValidForCard,
  pruneForCatalog,
  removeCard,
  resetCubeViewer,
  setCardDisplay,
  setFilters,
  updateCard,
} from "./viewer-state";

const CREATED_AT = "field:1";
const PLAN = "field:2";
const SEATS = "field:3";

const ACCOUNTS: CubeMeasure = {
  id: 1,
  name: "Accounts",
  isAdditive: true,
  dimensionIds: {
    [CREATED_AT]: "accounts-created-at",
    [PLAN]: "accounts-plan",
    [SEATS]: "accounts-seats",
  },
};

const AVERAGE_SEATS: CubeMeasure = {
  id: 2,
  name: "Average seats",
  isAdditive: false,
  dimensionIds: {
    [CREATED_AT]: "avg-created-at",
    [PLAN]: "avg-plan",
  },
};

const DIMENSIONS: CubeDimension[] = [
  {
    key: CREATED_AT,
    label: "Created At",
    type: "time",
    score: 0.8,
    distinctCount: 1000,
    canListValues: false,
  },
  {
    key: PLAN,
    label: "Plan",
    type: "category",
    score: 0.7,
    distinctCount: 3,
    canListValues: true,
  },
  {
    key: SEATS,
    label: "Seats",
    type: "numeric",
    score: 0.5,
    distinctCount: 40,
    canListValues: false,
  },
];

const CATALOG: CubeCatalog = {
  tableId: 9,
  measures: [ACCOUNTS, AVERAGE_SEATS],
  dimensions: DIMENSIONS,
  segments: [
    { id: 10, name: "Enterprise" },
    { id: 11, name: "Legacy plan" },
  ],
};

const singleCardId = (measure: CubeMeasure, key: string) =>
  `single:m${measure.id}:${key}`;

/** Minimal deterministic generator: one overview per measure, one single per measure × dimension. */
const FAKE_GENERATOR: CardGenerator = {
  id: "fake",
  name: "Fake",
  description: "Test generator",
  getDefaultSettings: (catalog) => ({
    measureIds: catalog.measures.map((measure) => measure.id),
    dimensionKeys: catalog.dimensions.map((dimension) => dimension.key),
    filterDimensionKeys: catalog.dimensions.map((dimension) => dimension.key),
  }),
  generateCards: (catalog, settings) => {
    const measures = catalog.measures.filter((measure) =>
      settings.measureIds.includes(measure.id),
    );
    const dimensions = catalog.dimensions.filter((dimension) =>
      settings.dimensionKeys.includes(dimension.key),
    );
    return measures.flatMap((measure) => [
      {
        id: `overview:m${measure.id}`,
        kind: "overview" as const,
        series: [{ measureId: measure.id, segmentIds: [] }],
        dimensionKeys: [],
        display: "scalar" as const,
      },
      ...dimensions
        .filter((dimension) => measure.dimensionIds[dimension.key] != null)
        .map(
          (dimension): CubeCard => ({
            id: singleCardId(measure, dimension.key),
            kind: "single",
            series: [{ measureId: measure.id, segmentIds: [] }],
            dimensionKeys: [dimension.key],
            display: dimension.type === "time" ? "line" : "bar",
          }),
        ),
    ]);
  },
};

const PLAN_FILTER: CubeDimensionFilter = {
  dimensionKey: PLAN,
  value: { type: "string", operator: "=", values: ["Pro"], options: {} },
};

const CREATED_AT_FILTER: CubeDimensionFilter = {
  dimensionKey: CREATED_AT,
  value: {
    type: "relative-date",
    value: -30,
    unit: "day",
    offsetValue: null,
    offsetUnit: null,
    options: {},
  },
};

const CUSTOM_CARD: CubeCard = {
  id: "custom-1",
  kind: "custom",
  series: [{ measureId: ACCOUNTS.id, segmentIds: [10] }],
  dimensionKeys: [PLAN],
  display: "bar",
};

const initialState = () => getInitialCubeViewerState(CATALOG, FAKE_GENERATOR);

const findCard = (state: CubeViewerState, cardId: string): CubeCard => {
  const card = state.cards.find((card) => card.id === cardId);
  if (!card) {
    throw new Error(`Missing card ${cardId}`);
  }
  return card;
};

describe("getInitialCubeViewerState", () => {
  it("comes from the generator", () => {
    const state = initialState();
    const settings = FAKE_GENERATOR.getDefaultSettings(CATALOG);

    expect(state).toEqual({
      generatorId: "fake",
      mode: "coarse",
      settings,
      cards: FAKE_GENERATOR.generateCards(CATALOG, settings),
      displayOverrides: {},
      filters: { segmentIds: [], dimensionFilters: [] },
    });
    expect(state.cards).toHaveLength(7);
  });
});

describe("applyCoarseSettings", () => {
  const narrowSettings: CubeCoarseSettings = {
    measureIds: [ACCOUNTS.id],
    dimensionKeys: [CREATED_AT, SEATS],
    filterDimensionKeys: [CREATED_AT],
  };

  it("regenerates cards from the new settings", () => {
    const state = applyCoarseSettings(
      initialState(),
      CATALOG,
      FAKE_GENERATOR,
      narrowSettings,
    );

    expect(state.mode).toBe("coarse");
    expect(state.settings).toEqual(narrowSettings);
    expect(state.cards.map((card) => card.id)).toEqual([
      "overview:m1",
      singleCardId(ACCOUNTS, CREATED_AT),
      singleCardId(ACCOUNTS, SEATS),
    ]);
  });

  it("keeps display overrides that still apply and drops the rest", () => {
    const keptId = singleCardId(ACCOUNTS, CREATED_AT);
    const droppedId = singleCardId(AVERAGE_SEATS, PLAN);
    let state = setCardDisplay(initialState(), keptId, "area");
    state = setCardDisplay(state, droppedId, "line");

    state = applyCoarseSettings(state, CATALOG, FAKE_GENERATOR, narrowSettings);

    expect(state.displayOverrides).toEqual({ [keptId]: "area" });
    expect(findCard(state, keptId).display).toBe("area");
  });

  it("drops dimension filters that are no longer filter dimensions", () => {
    let state = setFilters(initialState(), {
      segmentIds: [10],
      dimensionFilters: [PLAN_FILTER, CREATED_AT_FILTER],
    });

    state = applyCoarseSettings(state, CATALOG, FAKE_GENERATOR, narrowSettings);

    expect(state.filters).toEqual({
      segmentIds: [10],
      dimensionFilters: [CREATED_AT_FILTER],
    });
  });

  it("returns the same object when the settings do not change anything", () => {
    const state = initialState();

    expect(
      applyCoarseSettings(state, CATALOG, FAKE_GENERATOR, state.settings),
    ).toBe(state);
  });

  it("does nothing in fine mode", () => {
    const state = addCard(initialState(), CUSTOM_CARD);

    expect(
      applyCoarseSettings(state, CATALOG, FAKE_GENERATOR, narrowSettings),
    ).toBe(state);
  });
});

describe("setCardDisplay", () => {
  const cardId = singleCardId(ACCOUNTS, PLAN);

  it("records an override and updates the card in coarse mode without changing the mode", () => {
    const state = setCardDisplay(initialState(), cardId, "line");

    expect(state.mode).toBe("coarse");
    expect(state.displayOverrides).toEqual({ [cardId]: "line" });
    expect(findCard(state, cardId).display).toBe("line");
  });

  it("only updates the card in fine mode", () => {
    const fineState = addCard(initialState(), CUSTOM_CARD);
    const state = setCardDisplay(fineState, cardId, "line");

    expect(state.mode).toBe("fine");
    expect(state.displayOverrides).toEqual({});
    expect(findCard(state, cardId).display).toBe("line");
  });

  it("returns the same object for unknown cards or unchanged displays", () => {
    const state = initialState();

    expect(setCardDisplay(state, "missing", "line")).toBe(state);
    expect(setCardDisplay(state, cardId, "bar")).toBe(state);
  });
});

describe("fine-mode edits", () => {
  const overriddenId = singleCardId(ACCOUNTS, CREATED_AT);
  const coarseWithOverride = () =>
    setCardDisplay(initialState(), overriddenId, "bar");

  it("addCard switches to fine mode, folds in overrides, and appends", () => {
    const state = addCard(coarseWithOverride(), CUSTOM_CARD);

    expect(state.mode).toBe("fine");
    expect(state.displayOverrides).toEqual({});
    expect(findCard(state, overriddenId).display).toBe("bar");
    expect(state.cards[state.cards.length - 1]).toBe(CUSTOM_CARD);
    expect(state.settings).toEqual(coarseWithOverride().settings);
  });

  it("addCard ignores a card whose id already exists", () => {
    const state = initialState();

    expect(addCard(state, findCard(state, overriddenId))).toBe(state);
  });

  it("updateCard switches to fine mode and marks the card custom", () => {
    const edited: CubeCard = {
      ...findCard(initialState(), overriddenId),
      series: [{ measureId: ACCOUNTS.id, segmentIds: [11] }],
      display: "area",
    };
    const state = updateCard(coarseWithOverride(), edited);

    expect(state.mode).toBe("fine");
    expect(state.displayOverrides).toEqual({});
    expect(findCard(state, overriddenId)).toEqual({
      ...edited,
      kind: "custom",
    });
    expect(state.cards).toHaveLength(7);
  });

  it("updateCard returns the same object for unknown cards", () => {
    const state = initialState();

    expect(updateCard(state, CUSTOM_CARD)).toBe(state);
  });

  it("removeCard switches to fine mode and removes the card", () => {
    const state = removeCard(coarseWithOverride(), overriddenId);

    expect(state.mode).toBe("fine");
    expect(state.displayOverrides).toEqual({});
    expect(state.cards.map((card) => card.id)).not.toContain(overriddenId);
    expect(state.cards).toHaveLength(6);
  });

  it("removeCard returns the same object for unknown cards", () => {
    const state = initialState();

    expect(removeCard(state, "missing")).toBe(state);
  });
});

describe("setFilters", () => {
  it("replaces the filters without changing mode or cards", () => {
    const initial = initialState();
    const filters: CubeFilters = {
      segmentIds: [10],
      dimensionFilters: [PLAN_FILTER],
    };
    const state = setFilters(initial, filters);

    expect(state.filters).toBe(filters);
    expect(state.mode).toBe("coarse");
    expect(state.cards).toBe(initial.cards);
  });

  it("returns the same object for equal filters", () => {
    const state = setFilters(initialState(), {
      segmentIds: [10],
      dimensionFilters: [PLAN_FILTER],
    });

    expect(
      setFilters(state, {
        segmentIds: [10],
        dimensionFilters: [{ ...PLAN_FILTER }],
      }),
    ).toBe(state);
  });
});

describe("resetCubeViewer", () => {
  it("restores the defaults", () => {
    let state = setCardDisplay(
      initialState(),
      singleCardId(ACCOUNTS, PLAN),
      "line",
    );
    state = addCard(state, CUSTOM_CARD);
    state = setFilters(state, { segmentIds: [10], dimensionFilters: [] });

    expect(resetCubeViewer(CATALOG, FAKE_GENERATOR)).toEqual(initialState());
    expect(state).not.toEqual(initialState());
  });
});

describe("pruneForCatalog", () => {
  const prunedCatalog: CubeCatalog = {
    ...CATALOG,
    measures: [ACCOUNTS],
    dimensions: DIMENSIONS.filter((dimension) => dimension.key !== SEATS),
    segments: [{ id: 10, name: "Enterprise" }],
  };

  it("returns the same object when the catalog still covers everything", () => {
    const state = setFilters(initialState(), {
      segmentIds: [10],
      dimensionFilters: [PLAN_FILTER],
    });

    expect(pruneForCatalog(state, { ...CATALOG }, FAKE_GENERATOR)).toBe(state);
  });

  it("in coarse mode drops unknown ids from settings, regenerates, and prunes filters", () => {
    let state = setFilters(initialState(), {
      segmentIds: [10, 11],
      dimensionFilters: [
        PLAN_FILTER,
        { dimensionKey: SEATS, value: PLAN_FILTER.value },
      ],
    });
    state = setCardDisplay(state, singleCardId(ACCOUNTS, PLAN), "line");

    state = pruneForCatalog(state, prunedCatalog, FAKE_GENERATOR);

    expect(state.mode).toBe("coarse");
    expect(state.settings).toEqual({
      measureIds: [ACCOUNTS.id],
      dimensionKeys: [CREATED_AT, PLAN],
      filterDimensionKeys: [CREATED_AT, PLAN],
    });
    expect(state.cards.map((card) => card.id)).toEqual([
      "overview:m1",
      singleCardId(ACCOUNTS, CREATED_AT),
      singleCardId(ACCOUNTS, PLAN),
    ]);
    expect(findCard(state, singleCardId(ACCOUNTS, PLAN)).display).toBe("line");
    expect(state.filters).toEqual({
      segmentIds: [10],
      dimensionFilters: [PLAN_FILTER],
    });
  });

  it("in coarse mode drops overrides whose display is no longer valid", () => {
    const seatsId = singleCardId(ACCOUNTS, SEATS);
    const state = setCardDisplay(initialState(), seatsId, "scatter");
    const seatsAsCategory: CubeCatalog = {
      ...CATALOG,
      dimensions: DIMENSIONS.map((dimension) =>
        dimension.key === SEATS
          ? { ...dimension, type: "category" }
          : dimension,
      ),
    };

    const pruned = pruneForCatalog(state, seatsAsCategory, FAKE_GENERATOR);

    expect(pruned.displayOverrides).toEqual({});
    expect(findCard(pruned, seatsId).display).toBe("bar");
  });

  it("in fine mode drops cards and series that reference removed entities", () => {
    let state = addCard(initialState(), CUSTOM_CARD);
    state = addCard(state, {
      id: "segment-vs-total",
      kind: "custom",
      series: [
        { measureId: ACCOUNTS.id, segmentIds: [] },
        { measureId: ACCOUNTS.id, segmentIds: [11] },
      ],
      dimensionKeys: [CREATED_AT],
      display: "line",
    });
    state = setFilters(state, {
      segmentIds: [11],
      dimensionFilters: [{ dimensionKey: SEATS, value: PLAN_FILTER.value }],
    });

    const pruned = pruneForCatalog(state, prunedCatalog, FAKE_GENERATOR);

    expect(pruned.mode).toBe("fine");
    expect(pruned.settings).toBe(state.settings);
    expect(pruned.cards.map((card) => card.id)).toEqual([
      "overview:m1",
      singleCardId(ACCOUNTS, CREATED_AT),
      singleCardId(ACCOUNTS, PLAN),
      CUSTOM_CARD.id,
      "segment-vs-total",
    ]);
    expect(findCard(pruned, "segment-vs-total").series).toEqual([
      { measureId: ACCOUNTS.id, segmentIds: [] },
    ]);
    expect(pruned.filters).toEqual({ segmentIds: [], dimensionFilters: [] });
  });

  it("in fine mode drops series whose measure no longer supports the card's dimensions", () => {
    const state = addCard(initialState(), CUSTOM_CARD);
    const withoutPlanOnAccounts: CubeCatalog = {
      ...CATALOG,
      measures: [
        { ...ACCOUNTS, dimensionIds: { [CREATED_AT]: "accounts-created-at" } },
        AVERAGE_SEATS,
      ],
    };

    const pruned = pruneForCatalog(
      state,
      withoutPlanOnAccounts,
      FAKE_GENERATOR,
    );

    expect(pruned.cards.map((card) => card.id)).not.toContain(CUSTOM_CARD.id);
    expect(pruned.cards.map((card) => card.id)).not.toContain(
      singleCardId(ACCOUNTS, PLAN),
    );
    expect(pruned.cards.map((card) => card.id)).toContain(
      singleCardId(AVERAGE_SEATS, PLAN),
    );
  });
});

describe("isDisplayValidForCard", () => {
  it("allows only scalar for cards without dimensions", () => {
    const card = { dimensionKeys: [] };

    expect(isDisplayValidForCard(card, CATALOG, "scalar")).toBe(true);
    expect(isDisplayValidForCard(card, CATALOG, "bar")).toBe(false);
  });

  it("checks the first dimension's available display types", () => {
    expect(
      isDisplayValidForCard({ dimensionKeys: [CREATED_AT] }, CATALOG, "line"),
    ).toBe(true);
    expect(
      isDisplayValidForCard({ dimensionKeys: [CREATED_AT] }, CATALOG, "map"),
    ).toBe(false);
    expect(
      isDisplayValidForCard({ dimensionKeys: [SEATS] }, CATALOG, "scatter"),
    ).toBe(true);
    expect(
      isDisplayValidForCard({ dimensionKeys: ["field:404"] }, CATALOG, "bar"),
    ).toBe(false);
  });
});
