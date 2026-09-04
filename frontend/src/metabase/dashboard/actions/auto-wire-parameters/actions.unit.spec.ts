import { getMainStore } from "__support__/entities-store";
import {
  getParameters,
  getQuestions,
  getTabs,
} from "metabase/dashboard/selectors";
import {
  type ParameterMappingOption,
  getParameterMappingOptions,
} from "metabase/parameters/utils/mapping-options";
import {
  createMockDashboardState,
  createMockState,
  createMockStoreDashboard,
} from "metabase/redux/store/mocks";
import { performUndo } from "metabase/redux/undo";
import { createMockUiParameter } from "metabase-lib/v1/parameters/mock";
import type {
  CardId,
  StructuredParameterDimensionTarget,
} from "metabase-types/api";
import {
  createMockCard,
  createMockDashboardCard,
  createMockParameterMapping,
} from "metabase-types/api/mocks";

import { showAutoWireToast } from "./actions";

jest.mock("metabase/dashboard/selectors", () => ({
  ...jest.requireActual("metabase/dashboard/selectors"),
  getParameters: jest.fn(),
  getQuestions: jest.fn(),
  getTabs: jest.fn(),
}));

jest.mock("metabase/parameters/utils/mapping-options", () => ({
  ...jest.requireActual("metabase/parameters/utils/mapping-options"),
  getParameterMappingOptions: jest.fn(),
}));

const PARAMETER_ID = "parameter";
const MATCHING_TARGET: StructuredParameterDimensionTarget = [
  "dimension",
  ["field", 100, null],
];

function getMappingOption(cardId: CardId): ParameterMappingOption {
  return {
    sectionName: "Table",
    name: `Column ${cardId}`,
    icon: "int",
    target: MATCHING_TARGET,
  };
}

describe("showAutoWireToast", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .mocked(getParameters)
      .mockReturnValue([createMockUiParameter({ id: PARAMETER_ID })]);
    jest.mocked(getQuestions).mockReturnValue({});
    jest.mocked(getTabs).mockReturnValue([]);
    jest
      .mocked(getParameterMappingOptions)
      .mockImplementation((_question, _parameter, card) => {
        if (card.id == null) {
          return [];
        }
        return [getMappingOption(card.id)];
      });
  });

  it("auto-wires an unmapped sibling card and preserves the selected mapping", async () => {
    const existingMapping = createMockParameterMapping({
      parameter_id: PARAMETER_ID,
      card_id: 2,
      target: MATCHING_TARGET,
    });
    const dashcard = createMockDashboardCard({
      id: 1,
      dashboard_tab_id: 1,
      card_id: 1,
      card: createMockCard({ id: 1 }),
      series: [createMockCard({ id: 2 })],
      parameter_mappings: [existingMapping],
    });
    const store = getMainStore(
      createMockState({
        dashboard: createMockDashboardState({
          dashboardId: 1,
          selectedTabId: 1,
          dashboards: {
            1: createMockStoreDashboard({
              id: 1,
              dashcards: [dashcard.id],
            }),
          },
          dashcards: { [dashcard.id]: dashcard },
        }),
      }),
    );

    await store.dispatch(
      showAutoWireToast(PARAMETER_ID, dashcard.id, 2, MATCHING_TARGET, 1),
    );

    const autoWireToast = store
      .getState()
      .undo.find(({ actionLabel }) => actionLabel === "Auto-connect");
    expect(autoWireToast?.message).toContain("Column 2");

    await store.dispatch(performUndo(autoWireToast!.id));

    expect(
      store.getState().dashboard.dashcards[dashcard.id].parameter_mappings,
    ).toEqual([
      existingMapping,
      {
        parameter_id: PARAMETER_ID,
        card_id: 1,
        target: MATCHING_TARGET,
      },
    ]);

    const undoToast = store
      .getState()
      .undo.find(({ type }) => type === "filterAutoConnectDone");
    await store.dispatch(performUndo(undoToast!.id));

    expect(
      store.getState().dashboard.dashcards[dashcard.id].parameter_mappings,
    ).toEqual([existingMapping]);
  });
});
