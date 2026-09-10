// Pure state transitions for the cube viewer. Every transition returns the
// same object when nothing changes, so `setState((prev) => …)` can bail out.
import _ from "underscore";

import type { MetricsViewerDisplayType } from "metabase/common/metrics-viewer";

import { AVAILABLE_DISPLAYS_BY_TYPE } from "../generators/shared";
import type {
  CardGenerator,
  CubeCard,
  CubeCatalog,
  CubeCoarseSettings,
  CubeSeries,
} from "../generators/types";
import type { CubeFilters, CubeViewerState } from "../types";

const EMPTY_FILTERS: CubeFilters = { segmentIds: [], dimensionFilters: [] };

export function getInitialCubeViewerState(
  catalog: CubeCatalog,
  generator: CardGenerator,
): CubeViewerState {
  const settings = generator.getDefaultSettings(catalog);
  return {
    generatorId: generator.id,
    mode: "coarse",
    settings,
    cards: generator.generateCards(catalog, settings),
    displayOverrides: {},
    filters: EMPTY_FILTERS,
  };
}

export const resetCubeViewer = getInitialCubeViewerState;

export function applyCoarseSettings(
  state: CubeViewerState,
  catalog: CubeCatalog,
  generator: CardGenerator,
  settings: CubeCoarseSettings,
): CubeViewerState {
  if (state.mode !== "coarse") {
    return state;
  }
  const next = regenerateCards(state, catalog, generator, settings);
  return _.isEqual(next, state) ? state : next;
}

export function setCardDisplay(
  state: CubeViewerState,
  cardId: string,
  display: MetricsViewerDisplayType,
): CubeViewerState {
  const card = state.cards.find((card) => card.id === cardId);
  if (!card) {
    return state;
  }
  const isSameDisplay = card.display === display;
  if (state.mode === "fine") {
    if (isSameDisplay) {
      return state;
    }
    return {
      ...state,
      cards: state.cards.map((card) =>
        card.id === cardId ? { ...card, display } : card,
      ),
    };
  }
  // In coarse mode a display may be rendered by a viz heuristic rather than
  // the card itself, so an explicit pick is recorded as an override even when
  // it matches the generated display.
  if (isSameDisplay && state.displayOverrides[cardId] === display) {
    return state;
  }
  return {
    ...state,
    cards: isSameDisplay
      ? state.cards
      : state.cards.map((card) =>
          card.id === cardId ? { ...card, display } : card,
        ),
    displayOverrides: { ...state.displayOverrides, [cardId]: display },
  };
}

export function addCard(
  state: CubeViewerState,
  card: CubeCard,
): CubeViewerState {
  if (state.cards.some((existing) => existing.id === card.id)) {
    return state;
  }
  const fineState = switchToFineMode(state);
  return { ...fineState, cards: [...fineState.cards, card] };
}

export function updateCard(
  state: CubeViewerState,
  card: CubeCard,
): CubeViewerState {
  if (!state.cards.some((existing) => existing.id === card.id)) {
    return state;
  }
  const fineState = switchToFineMode(state);
  return {
    ...fineState,
    cards: fineState.cards.map((existing) =>
      existing.id === card.id ? { ...card, kind: "custom" } : existing,
    ),
  };
}

export function removeCard(
  state: CubeViewerState,
  cardId: string,
): CubeViewerState {
  if (!state.cards.some((existing) => existing.id === cardId)) {
    return state;
  }
  const fineState = switchToFineMode(state);
  return {
    ...fineState,
    cards: fineState.cards.filter((existing) => existing.id !== cardId),
  };
}

/** Never changes the mode and never regenerates cards. */
export function setFilters(
  state: CubeViewerState,
  filters: CubeFilters,
): CubeViewerState {
  return _.isEqual(filters, state.filters) ? state : { ...state, filters };
}

/**
 * Run when the catalog changes (refetch). Drops references to measures,
 * dimensions, and segments that are no longer in the catalog.
 */
export function pruneForCatalog(
  state: CubeViewerState,
  catalog: CubeCatalog,
  generator: CardGenerator,
): CubeViewerState {
  const next =
    state.mode === "coarse"
      ? regenerateCards(
          state,
          catalog,
          generator,
          pruneSettings(state.settings, catalog),
        )
      : {
          ...state,
          cards: pruneCards(state.cards, catalog),
          filters: pruneFilters(state.filters, catalog),
        };
  return _.isEqual(next, state) ? state : next;
}

/** `display` must fit the card's first dimension type, or be `scalar` without dimensions. */
export function isDisplayValidForCard(
  card: Pick<CubeCard, "dimensionKeys">,
  catalog: CubeCatalog,
  display: MetricsViewerDisplayType,
): boolean {
  const [firstDimensionKey] = card.dimensionKeys;
  if (firstDimensionKey == null) {
    return display === "scalar";
  }
  const dimension = catalog.dimensions.find(
    (dimension) => dimension.key === firstDimensionKey,
  );
  if (!dimension) {
    return false;
  }
  return AVAILABLE_DISPLAYS_BY_TYPE[dimension.type].includes(display);
}

/** Cards already carry their overridden displays, so the overrides are folded in. */
function switchToFineMode(state: CubeViewerState): CubeViewerState {
  if (state.mode === "fine") {
    return state;
  }
  return { ...state, mode: "fine", displayOverrides: {} };
}

/**
 * Coarse-mode regeneration: keeps the display overrides whose card ids still
 * exist and whose display is still valid, and drops dimension filters that are
 * no longer in `filterDimensionKeys`.
 */
function regenerateCards(
  state: CubeViewerState,
  catalog: CubeCatalog,
  generator: CardGenerator,
  settings: CubeCoarseSettings,
): CubeViewerState {
  const generatedCards = generator.generateCards(catalog, settings);
  const displayOverrides: CubeViewerState["displayOverrides"] = {};
  const cards = generatedCards.map((card) => {
    const override = state.displayOverrides[card.id];
    if (override == null || !isDisplayValidForCard(card, catalog, override)) {
      return card;
    }
    displayOverrides[card.id] = override;
    return { ...card, display: override };
  });

  const filterDimensionKeys = new Set(settings.filterDimensionKeys);
  const prunedFilters = pruneFilters(state.filters, catalog);
  const filters: CubeFilters = {
    ...prunedFilters,
    dimensionFilters: prunedFilters.dimensionFilters.filter((filter) =>
      filterDimensionKeys.has(filter.dimensionKey),
    ),
  };

  return { ...state, settings, cards, displayOverrides, filters };
}

function pruneSettings(
  settings: CubeCoarseSettings,
  catalog: CubeCatalog,
): CubeCoarseSettings {
  const measureIds = new Set(catalog.measures.map((measure) => measure.id));
  const dimensionKeys = new Set(
    catalog.dimensions.map((dimension) => dimension.key),
  );
  return {
    measureIds: settings.measureIds.filter((id) => measureIds.has(id)),
    dimensionKeys: settings.dimensionKeys.filter((key) =>
      dimensionKeys.has(key),
    ),
    filterDimensionKeys: settings.filterDimensionKeys.filter((key) =>
      dimensionKeys.has(key),
    ),
  };
}

/**
 * Fine-mode pruning: a series survives when its measure and segments are in
 * the catalog and the measure still supports every dimension on the card; a
 * card survives when its dimensions are in the catalog and it has a series left.
 */
function pruneCards(cards: CubeCard[], catalog: CubeCatalog): CubeCard[] {
  const measuresById = new Map(
    catalog.measures.map((measure) => [measure.id, measure]),
  );
  const dimensionKeys = new Set(
    catalog.dimensions.map((dimension) => dimension.key),
  );
  const segmentIds = new Set(catalog.segments.map((segment) => segment.id));

  const isSeriesValid = (series: CubeSeries, card: CubeCard) => {
    const measure = measuresById.get(series.measureId);
    return (
      measure != null &&
      series.segmentIds.every((id) => segmentIds.has(id)) &&
      card.dimensionKeys.every((key) => measure.dimensionIds[key] != null)
    );
  };

  return cards.flatMap((card) => {
    if (!card.dimensionKeys.every((key) => dimensionKeys.has(key))) {
      return [];
    }
    const series = card.series.filter((series) => isSeriesValid(series, card));
    if (series.length === 0) {
      return [];
    }
    return [series.length === card.series.length ? card : { ...card, series }];
  });
}

function pruneFilters(filters: CubeFilters, catalog: CubeCatalog): CubeFilters {
  const dimensionKeys = new Set(
    catalog.dimensions.map((dimension) => dimension.key),
  );
  const segmentIds = new Set(catalog.segments.map((segment) => segment.id));
  return {
    segmentIds: filters.segmentIds.filter((id) => segmentIds.has(id)),
    dimensionFilters: filters.dimensionFilters.filter((filter) =>
      dimensionKeys.has(filter.dimensionKey),
    ),
  };
}
