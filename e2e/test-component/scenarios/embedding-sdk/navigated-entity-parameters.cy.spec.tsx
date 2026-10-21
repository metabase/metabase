import {
  InteractiveDashboard,
  type NavigatedEntityParameters,
  type ParameterValues,
} from "@metabase/embedding-sdk-react";
import { useState } from "react";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import { mountSdkContent } from "e2e/support/helpers/embedding-sdk-component-testing/component-embedding-sdk-helpers";
import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/embedding-sdk-testing";
import { mockAuthProviderAndJwtSignIn } from "e2e/support/helpers/embedding-sdk-testing/embedding-sdk-helpers";
import type { Parameter, TemplateTags } from "metabase-types/api";
import {
  createMockActionParameter,
  createMockParameter,
} from "metabase-types/api/mocks";

const { H } = cy;

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

// On the TARGET dashboard. The click behavior maps the clicked row's ID onto this one.
const TARGET_ID_FILTER: Parameter = createMockActionParameter({
  id: "target-id-filter",
  name: "ID Filter",
  slug: "id-filter",
  type: "number/=",
  sectionId: "number",
});

// Also on the TARGET dashboard, but the click behavior does NOT map it.
// The host controls it through `navigatedEntityParameters`.
const TARGET_QUANTITY_FILTER: Parameter = createMockActionParameter({
  id: "target-quantity-filter",
  name: "Quantity Filter",
  slug: "quantity-filter",
  type: "number/=",
  sectionId: "number",
});

// On the ORIGIN dashboard, so the root has a filter of its own. No test sets it.
const ORIGIN_FILTER: Parameter = createMockActionParameter({
  id: "origin-city-filter",
  name: "City Filter",
  slug: "city-filter",
  type: "string/=",
  sectionId: "string",
});

const HOST_QUANTITY_VALUE = 2;

type HostProps = {
  dashboardId: number;
  valuesToWrite: ParameterValues;
};

// Like a host with its own filter panel: it learns the `navigationId` from
// `initial-state` and writes its values for that visit.
const HostWritingOnInitialState = ({
  dashboardId,
  valuesToWrite,
}: HostProps) => {
  const [navigatedEntityParameters, setNavigatedEntityParameters] =
    useState<NavigatedEntityParameters>({});

  return (
    <InteractiveDashboard
      dashboardId={dashboardId}
      enableEntityNavigation
      navigatedEntityParameters={navigatedEntityParameters}
      onNavigatedEntityParametersChange={(payload) => {
        if (payload.source === "initial-state") {
          setNavigatedEntityParameters((prev) => {
            // If the map already has this navigationId, this is a back navigation
            // and we don't want to change the parameters
            if (prev[payload.navigationId]) {
              return prev;
            }
            return { ...prev, [payload.navigationId]: valuesToWrite };
          });
        }
      }}
    />
  );
};

describe("scenarios > embedding-sdk > navigated entity parameters", () => {
  beforeEach(() => {
    signInAsAdminAndEnableEmbeddingSdk();

    H.createDashboard({
      name: "Target Dashboard",
      parameters: [TARGET_ID_FILTER, TARGET_QUANTITY_FILTER],
    }).then(({ body: targetDashboard }) => {
      cy.wrap(targetDashboard.id).as("targetDashboardId");

      H.createQuestion({
        name: "Orders for Target Dashboard",
        query: { "source-table": ORDERS_ID, limit: 5 },
      }).then(({ body: targetQuestion }) => {
        H.addOrUpdateDashboardCard({
          card_id: targetQuestion.id,
          dashboard_id: targetDashboard.id,
          card: {
            row: 0,
            col: 0,
            size_x: 24,
            size_y: 8,
            parameter_mappings: [
              {
                parameter_id: TARGET_ID_FILTER.id,
                card_id: targetQuestion.id,
                target: ["dimension", ["field", ORDERS.ID, null]],
              },
              {
                parameter_id: TARGET_QUANTITY_FILTER.id,
                card_id: targetQuestion.id,
                target: ["dimension", ["field", ORDERS.QUANTITY, null]],
              },
            ],
          },
        });
      });
    });

    cy.get<number>("@targetDashboardId").then((targetDashboardId) => {
      H.createDashboard({
        name: "Origin Dashboard",
        parameters: [ORIGIN_FILTER],
      }).then(({ body: originDashboard }) => {
        cy.wrap(originDashboard.id).as("originDashboardId");

        H.createQuestion({
          name: "Orders for Origin Dashboard",
          query: { "source-table": ORDERS_ID, limit: 5 },
        }).then(({ body: originQuestion }) => {
          H.addOrUpdateDashboardCard({
            card_id: originQuestion.id,
            dashboard_id: originDashboard.id,
            card: {
              row: 0,
              col: 0,
              size_x: 24,
              size_y: 8,
              visualization_settings: {
                column_settings: {
                  [`["ref",["field",${ORDERS.ID},null]]`]: {
                    click_behavior: {
                      type: "link",
                      linkType: "dashboard",
                      linkTextTemplate: "Go to Target Dashboard",
                      targetId: targetDashboardId,
                      // Only `id-filter` is mapped. `quantity-filter` is left
                      // to the host.
                      parameterMapping: {
                        [TARGET_ID_FILTER.id]: {
                          source: { type: "column", id: "ID", name: "ID" },
                          target: {
                            type: "parameter",
                            id: TARGET_ID_FILTER.id,
                          },
                          id: TARGET_ID_FILTER.id,
                        },
                      },
                    },
                  },
                },
              },
            },
          });
        });
      });
    });

    cy.signOut();
    mockAuthProviderAndJwtSignIn();
  });

  it("replaces the click-behavior values with the host entry for the visit, like root `parameters`", () => {
    cy.get<number>("@originDashboardId").then((originDashboardId) => {
      mountSdkContent(
        <HostWritingOnInitialState
          dashboardId={originDashboardId}
          valuesToWrite={{ "quantity-filter": HOST_QUANTITY_VALUE }}
        />,
      );
    });

    getSdkRoot().within(() => {
      cy.findByText("Origin Dashboard").should("be.visible");

      H.getDashboardCard()
        .findAllByText("Go to Target Dashboard")
        .should("have.length", 5)
        .first()
        .click();

      cy.findByText("Target Dashboard").should("be.visible");

      cy.log("The host value lands on the slug it named");
      H.filterWidget({ name: "Quantity Filter" }).should(
        "contain.text",
        String(HOST_QUANTITY_VALUE),
      );

      cy.log("The slug the host omitted falls back to its default, empty");
      H.filterWidget({ name: "ID Filter" })
        .should("be.visible")
        .icon("close")
        .should("not.exist");
    });
  });
});

const SQL_TARGET_TEMPLATE_TAGS: TemplateTags = {
  category: {
    id: "category",
    name: "category",
    "display-name": "Category",
    type: "dimension",
    "widget-type": "string/=",
    dimension: ["field", PRODUCTS.CATEGORY, null],
  },
};

describe("scenarios > embedding-sdk > navigated entity parameters > SQL question targets", () => {
  beforeEach(() => {
    signInAsAdminAndEnableEmbeddingSdk();

    H.createNativeQuestion({
      name: "SQL Target Question",
      native: {
        query: "SELECT * FROM PRODUCTS WHERE {{category}}",
        "template-tags": SQL_TARGET_TEMPLATE_TAGS,
      },
      parameters: [
        createMockParameter({
          id: "category",
          name: "Category",
          slug: "category",
          type: "string/=",
          target: ["dimension", ["template-tag", "category"]],
        }),
      ],
    }).then(({ body: sqlQuestion }) => {
      H.createDashboard({ name: "SQL Origin Dashboard" }).then(
        ({ body: originDashboard }) => {
          cy.wrap(originDashboard.id).as("originDashboardId");

          H.createQuestion({
            name: "Products for SQL Origin Dashboard",
            query: { "source-table": PRODUCTS_ID, limit: 5 },
          }).then(({ body: originQuestion }) => {
            H.addOrUpdateDashboardCard({
              card_id: originQuestion.id,
              dashboard_id: originDashboard.id,
              card: {
                row: 0,
                col: 0,
                size_x: 24,
                size_y: 8,
                visualization_settings: {
                  column_settings: {
                    [`["ref",["field",${PRODUCTS.CATEGORY},null]]`]: {
                      click_behavior: {
                        type: "link",
                        linkType: "question",
                        linkTextTemplate: "Go to SQL target",
                        targetId: sqlQuestion.id,
                        parameterMapping: {
                          category: {
                            id: "category",
                            source: {
                              type: "column",
                              id: "CATEGORY",
                              name: "Category",
                            },
                            target: { type: "variable", id: "category" },
                          },
                        },
                      },
                    },
                  },
                },
              },
            });
          });
        },
      );
    });

    cy.signOut();
    mockAuthProviderAndJwtSignIn();
  });

  it("controls the SQL target with the host entry for the visit instead of the click-behavior value", () => {
    cy.get<number>("@originDashboardId").then((originDashboardId) => {
      mountSdkContent(
        <HostWritingOnInitialState
          dashboardId={originDashboardId}
          valuesToWrite={{ category: "Widget" }}
        />,
      );
    });

    getSdkRoot().within(() => {
      H.getDashboardCard()
        .findAllByText("Go to SQL target")
        .should("have.length", 5)
        .first()
        .click();
      cy.findByText("SQL Target Question").should("be.visible");
    });

    cy.log("The host value replaces the clicked Gizmo");
    H.tableInteractiveBody().findAllByText("Widget").should("not.be.empty");
    H.ensureParameterColumnValue({
      columnName: "CATEGORY",
      columnValue: "Widget",
    });
  });
});
