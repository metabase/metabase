// Shared render helpers for the cube viewer component specs.
import type { ReactNode } from "react";

import { renderWithProviders } from "__support__/ui";
import type { MetricDefinition } from "metabase-lib/metric";
import type { MeasureId } from "metabase-types/api";

import { MetricCubeViewerProvider } from "../context";
import type { CubeViewerActions } from "../hooks/use-cube-viewer-state";
import { useCubeViewerState } from "../hooks/use-cube-viewer-state";
import type {
  CardGenerator,
  CubeCatalog,
  CubeFilters,
  CubeViewerState,
} from "../types";

export const NO_FILTERS: CubeFilters = { segmentIds: [], dimensionFilters: [] };

export const EMPTY_DEFINITIONS: Map<MeasureId, MetricDefinition> = new Map();

export function createMockActions(): CubeViewerActions {
  return {
    applyCoarseSettings: jest.fn(),
    setCardDisplay: jest.fn(),
    addCard: jest.fn(),
    updateCard: jest.fn(),
    removeCard: jest.fn(),
    setFilters: jest.fn(),
    reset: jest.fn(),
  };
}

interface StaticSetupOpts {
  catalog: CubeCatalog;
  generator: CardGenerator;
  state: CubeViewerState;
  definitions?: Map<MeasureId, MetricDefinition>;
  children: ReactNode;
}

/** Renders with a fixed state and mocked actions. */
export function renderWithStaticViewer({
  catalog,
  generator,
  state,
  definitions = EMPTY_DEFINITIONS,
  children,
}: StaticSetupOpts) {
  const actions = createMockActions();
  renderWithProviders(
    <MetricCubeViewerProvider
      value={{ catalog, definitions, state, actions, generator }}
    >
      {children}
    </MetricCubeViewerProvider>,
  );
  return { actions };
}

interface LiveSetupOpts {
  catalog: CubeCatalog;
  generator: CardGenerator;
  definitions?: Map<MeasureId, MetricDefinition>;
  children: ReactNode;
}

function LiveViewer({
  catalog,
  generator,
  definitions,
  children,
}: Required<LiveSetupOpts>) {
  const { state, actions } = useCubeViewerState({ catalog, generator });
  if (!state) {
    return null;
  }
  return (
    <MetricCubeViewerProvider
      value={{ catalog, definitions, state, actions, generator }}
    >
      <div data-testid="viewer-mode">{state.mode}</div>
      <div data-testid="viewer-card-ids">
        {state.cards.map((card) => card.id).join("\n")}
      </div>
      {children}
    </MetricCubeViewerProvider>
  );
}

/** Renders with the real state hook so mode transitions can be observed. */
export function renderWithLiveViewer({
  catalog,
  generator,
  definitions = EMPTY_DEFINITIONS,
  children,
}: LiveSetupOpts) {
  renderWithProviders(
    <LiveViewer
      catalog={catalog}
      generator={generator}
      definitions={definitions}
    >
      {children}
    </LiveViewer>,
  );
}
