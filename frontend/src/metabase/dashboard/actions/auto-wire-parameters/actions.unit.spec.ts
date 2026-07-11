import { createMockEntitiesState } from "__support__/store";
import type { Dispatch, GetState } from "metabase/redux/store";
import {
  createMockDashboardState,
  createMockState,
  createMockStoreDashboard,
} from "metabase/redux/store/mocks";
import type {
  DashboardParameterMapping,
  FieldReference,
} from "metabase-types/api";
import {
  createMockCard,
  createMockDashboardCard,
  createMockParameter,
  createMockStructuredDatasetQuery,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  PEOPLE,
  PRODUCTS,
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { showAutoWireToastNewCard } from "./actions";
import * as toasts from "./toasts";

const SOURCE_PARAMETER = createMockParameter({
  id: "27454068",
  name: "Source",
  slug: "source",
  type: "string/=",
  sectionId: "string",
});

const CATEGORY_PARAMETER = createMockParameter({
  id: "27454069",
  name: "Category",
  slug: "category",
  type: "string/=",
  sectionId: "string",
});

const CARD_ID = 10;
const EXISTING_DASHCARD_ID = 1;
const NEW_DASHCARD_ID = 2;

const SOURCE_TARGET: FieldReference = [
  "field",
  PEOPLE.SOURCE,
  { "source-field": ORDERS.USER_ID },
];
const CATEGORY_TARGET: FieldReference = [
  "field",
  PRODUCTS.CATEGORY,
  { "source-field": ORDERS.PRODUCT_ID },
];

function createOrdersCard() {
  return createMockCard({
    id: CARD_ID,
    dataset_query: createMockStructuredDatasetQuery({
      database: SAMPLE_DB_ID,
      query: { "source-table": ORDERS_ID },
    }),
  });
}

// A dashboard where two dashboard-level filters (Source, Category) are both
// mapped to the same existing card, then a copy of that card is added and
// auto-wired (metabase#44720).
function setup() {
  const card = createOrdersCard();

  const existingDashcard = createMockDashboardCard({
    id: EXISTING_DASHCARD_ID,
    card_id: CARD_ID,
    card,
    parameter_mappings: [
      {
        card_id: CARD_ID,
        parameter_id: SOURCE_PARAMETER.id,
        target: ["dimension", SOURCE_TARGET],
      },
      {
        card_id: CARD_ID,
        parameter_id: CATEGORY_PARAMETER.id,
        target: ["dimension", CATEGORY_TARGET],
      },
    ],
  });

  const newDashcard = createMockDashboardCard({
    id: NEW_DASHCARD_ID,
    card_id: CARD_ID,
    card,
    parameter_mappings: [],
  });

  const state = createMockState({
    entities: createMockEntitiesState({
      databases: [createSampleDatabase()],
    }),
    dashboard: createMockDashboardState({
      dashboardId: 1,
      editingDashboard: createMockStoreDashboard({ id: 1 }),
      dashboards: {
        "1": createMockStoreDashboard({
          id: 1,
          dashcards: [EXISTING_DASHCARD_ID, NEW_DASHCARD_ID],
          parameters: [SOURCE_PARAMETER, CATEGORY_PARAMETER],
        }),
      },
      dashcards: {
        [EXISTING_DASHCARD_ID]: existingDashcard,
        [NEW_DASHCARD_ID]: newDashcard,
      },
    }),
  });

  const dispatch: Dispatch = jest.fn();
  const getState: GetState = () => state;

  return { dispatch, getState };
}

function getFieldId(mapping: DashboardParameterMapping) {
  const [, fieldRef] = mapping.target as ["dimension", FieldReference];
  return fieldRef[1];
}

describe("dashboard/actions/auto-wire-parameters showAutoWireToastNewCard", () => {
  const spy = jest.spyOn(toasts, "showAddedCardAutoWireParametersToast");

  beforeEach(() => {
    spy.mockClear();
    spy.mockImplementation(() => () => undefined);
  });

  it("auto-wires each parameter to its own field target (metabase#44720)", () => {
    const { dispatch, getState } = setup();

    showAutoWireToastNewCard({ dashcard_id: NEW_DASHCARD_ID })(
      dispatch,
      getState,
    );

    expect(spy).toHaveBeenCalledTimes(1);
    const { parametersMappingsToApply } = spy.mock.calls[0][0];

    const targetByParameterId = Object.fromEntries(
      parametersMappingsToApply.map((mapping) => [
        mapping.parameter_id,
        getFieldId(mapping),
      ]),
    );

    // Source must wire to People.Source, Category to Products.Category.
    // The bug wired Category to People.Source (the first mapping's target).
    expect(targetByParameterId).toEqual({
      [SOURCE_PARAMETER.id]: PEOPLE.SOURCE,
      [CATEGORY_PARAMETER.id]: PRODUCTS.CATEGORY,
    });
  });
});
