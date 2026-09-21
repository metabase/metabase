import {
  InteractiveDashboard,
  type ParameterValues,
} from "@metabase/embedding-sdk-react";
import { useState } from "react";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ORDERS_DASHBOARD_DASHCARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import { mountSdkContent } from "e2e/support/helpers/embedding-sdk-component-testing";
import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/embedding-sdk-testing";
import { mockAuthProviderAndJwtSignIn } from "e2e/support/helpers/embedding-sdk-testing/embedding-sdk-helpers";
import type {
  ConcreteFieldReference,
  DashboardCard,
  Parameter,
} from "metabase-types/api";

const { H } = cy;
const { ORDERS } = SAMPLE_DATABASE;

const DATE_FILTER: Parameter = {
  id: "2",
  name: "Date filter",
  slug: "filter-date",
  type: "date/all-options",
};

const CREATED_AT_FIELD_REF: ConcreteFieldReference = [
  "field",
  ORDERS.CREATED_AT,
  { "base-type": "type/DateTime" },
];

const setup = () => {
  signInAsAdminAndEnableEmbeddingSdk();

  const questionCard: Partial<DashboardCard> = {
    id: ORDERS_DASHBOARD_DASHCARD_ID,
    parameter_mappings: [
      {
        parameter_id: DATE_FILTER.id,
        card_id: ORDERS_QUESTION_ID,
        target: ["dimension", CREATED_AT_FIELD_REF],
      },
    ],
    card_id: ORDERS_QUESTION_ID,
    row: 0,
    col: 0,
    size_x: 16,
    size_y: 8,
  };

  H.createDashboard({
    name: "Controlled parameters dashboard",
    dashcards: [questionCard],
    parameters: [DATE_FILTER],
  }).then(({ body: dashboard }) => {
    cy.wrap(dashboard.id).as("dashboardId");
  });

  cy.signOut();
  mockAuthProviderAndJwtSignIn();
};

const findDateFilterValue = () =>
  getSdkRoot()
    .findAllByTestId("parameter-widget")
    .filter(`:contains("${DATE_FILTER.name}")`);

describe("scenarios > embedding-sdk > sdk-dashboard > controlled parameters", () => {
  beforeEach(() => {
    setup();
    cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query").as(
      "dashcardQuery",
    );
  });

  it("forwards values pushed via the `parameters` prop to the dashcard query", () => {
    cy.get<string>("@dashboardId").then((dashboardId) => {
      mountSdkContent(
        <InteractiveDashboard
          dashboardId={dashboardId}
          parameters={{ "filter-date": "past30days" }}
        />,
      );
    });

    cy.wait("@dashcardQuery").then(({ request }) => {
      const parameters = request.body?.parameters ?? [];
      expect(parameters).to.have.length(1);
      expect(parameters[0]).to.include({
        id: DATE_FILTER.id,
        value: "past30days",
      });
    });

    findDateFilterValue().should("contain.text", "Previous 30 days");
  });

  it("re-runs the dashcard query when the `parameters` prop reference changes", () => {
    const SwitchableDashboard = ({ dashboardId }: { dashboardId: string }) => {
      const [parameters, setParameters] = useState<ParameterValues>({
        "filter-date": "past30days",
      });

      return (
        <>
          <button
            type="button"
            onClick={() => setParameters({ "filter-date": "thisyear" })}
          >
            switch to this year
          </button>
          <InteractiveDashboard
            dashboardId={dashboardId}
            parameters={parameters}
          />
        </>
      );
    };

    cy.get<string>("@dashboardId").then((dashboardId) => {
      mountSdkContent(<SwitchableDashboard dashboardId={dashboardId} />);
    });

    cy.wait("@dashcardQuery").then(({ request }) => {
      expect(request.body?.parameters?.[0]?.value).to.equal("past30days");
    });

    cy.contains("button", "switch to this year").click();

    cy.wait("@dashcardQuery").then(({ request }) => {
      expect(request.body?.parameters?.[0]?.value).to.equal("thisyear");
    });

    findDateFilterValue().should("contain.text", "This year");
  });

  it("fires `onParametersChange` with `source: 'initial-state'` exactly once on load", () => {
    const onParametersChange = cy.spy().as("onParametersChange");

    cy.get<string>("@dashboardId").then((dashboardId) => {
      mountSdkContent(
        <InteractiveDashboard
          dashboardId={dashboardId}
          onParametersChange={onParametersChange}
        />,
      );
    });

    cy.wait("@dashcardQuery");

    cy.get("@onParametersChange").should("have.been.calledOnce");
    cy.get("@onParametersChange")
      .its("firstCall.args.0")
      .should("include", { source: "initial-state" });
  });

  it("delivers `parameters`, `defaultParameters`, `lastUsedParameters` fields in the payload", () => {
    const onParametersChange = cy.spy().as("onParametersChange");

    cy.get<string>("@dashboardId").then((dashboardId) => {
      mountSdkContent(
        <InteractiveDashboard
          dashboardId={dashboardId}
          parameters={{ "filter-date": "past30days" }}
          onParametersChange={onParametersChange}
        />,
      );
    });

    cy.wait("@dashcardQuery");

    cy.get("@onParametersChange")
      .its("firstCall.args.0")
      .should((payload) => {
        expect(payload.source).to.equal("initial-state");
        expect(payload.parameters).to.deep.include({
          "filter-date": "past30days",
        });
        expect(payload.defaultParameters).to.be.an("object");
        expect(payload.lastUsedParameters).to.be.an("object");
      });
  });

  it("fires `onParametersChange` with `source: 'manual-change'` when the user edits the filter widget", () => {
    const onParametersChange = cy.spy().as("onParametersChange");

    cy.get<string>("@dashboardId").then((dashboardId) => {
      mountSdkContent(
        <InteractiveDashboard
          dashboardId={dashboardId}
          onParametersChange={onParametersChange}
        />,
      );
    });

    cy.wait("@dashcardQuery");

    cy.get("@onParametersChange").should("have.been.calledOnce");

    getSdkRoot().within(() => {
      H.filterWidget().contains(DATE_FILTER.name).click();
    });
    H.popover().findByText("Previous 30 days").click();

    cy.wait("@dashcardQuery");

    cy.get("@onParametersChange")
      .its("lastCall.args.0")
      .should((payload) => {
        expect(payload.source).to.equal("manual-change");
        expect(payload.parameters).to.deep.include({
          "filter-date": "past30days",
        });
      });
  });

  it("does not fire `onParametersChange` when pushed values are applied unchanged", () => {
    const onParametersChange = cy.spy().as("onParametersChange");

    const PushButton = ({ dashboardId }: { dashboardId: string }) => {
      const [parameters, setParameters] = useState<ParameterValues>({
        "filter-date": "past30days",
      });

      return (
        <>
          <button
            type="button"
            onClick={() => setParameters({ "filter-date": "thisyear" })}
          >
            push thisyear
          </button>
          <InteractiveDashboard
            dashboardId={dashboardId}
            parameters={parameters}
            onParametersChange={onParametersChange}
          />
        </>
      );
    };

    cy.get<string>("@dashboardId").then((dashboardId) => {
      mountSdkContent(<PushButton dashboardId={dashboardId} />);
    });

    cy.wait("@dashcardQuery");

    cy.get("@onParametersChange")
      .its("firstCall.args.0")
      .should("include", { source: "initial-state" });

    cy.contains("button", "push thisyear").click();

    cy.wait("@dashcardQuery");

    cy.wait(500);
    cy.get("@onParametersChange").should("have.been.calledOnce");
  });

  it("fires `onParametersChange` with `source: 'auto-change'` when an unknown slug in the push is passed", () => {
    const onParametersChange = cy.spy().as("onParametersChange");

    const PushButton = ({ dashboardId }: { dashboardId: string }) => {
      const [parameters, setParameters] = useState<ParameterValues>({
        "filter-date": "past30days",
      });

      return (
        <>
          <button
            type="button"
            onClick={() =>
              setParameters({
                "filter-date": "thisyear",
                "unknown-slug": "ignored",
              })
            }
          >
            push with unknown slug
          </button>
          <InteractiveDashboard
            dashboardId={dashboardId}
            parameters={parameters}
            onParametersChange={onParametersChange}
          />
        </>
      );
    };

    cy.get<string>("@dashboardId").then((dashboardId) => {
      mountSdkContent(<PushButton dashboardId={dashboardId} />);
    });

    cy.wait("@dashcardQuery");

    cy.contains("button", "push with unknown slug").click();
    cy.wait("@dashcardQuery");

    // Host pushed `{ "filter-date": ..., "unknown-slug": ... }` but the
    // dashboard only knows `filter-date`, so the payload omits
    // `unknown-slug`. That mismatch fires `auto-change` so the host can
    // sync from the actual applied state.
    cy.get("@onParametersChange")
      .its("lastCall.args.0")
      .should((payload) => {
        expect(payload.source).to.equal("auto-change");
        expect(payload.parameters).to.deep.include({
          "filter-date": "thisyear",
        });
        expect(payload.parameters).to.not.have.property("unknown-slug");
      });
  });

  it("does not fire a redundant `manual-change` after `initial-state` when the seed equals the BE-resolved values", () => {
    const onParametersChange = cy.spy().as("onParametersChange");

    cy.get<string>("@dashboardId").then((dashboardId) => {
      mountSdkContent(
        <InteractiveDashboard
          dashboardId={dashboardId}
          parameters={{ "filter-date": "past30days" }}
          onParametersChange={onParametersChange}
        />,
      );
    });

    cy.wait("@dashcardQuery");

    // Give the push hook's effect time to run; if it spuriously emits a
    // `manual-change`, it would have happened by now.
    cy.wait(500);

    cy.get("@onParametersChange").should("have.been.calledOnce");
  });

  it("clears a single parameter when its value is set to null", () => {
    const ClearableDashboard = ({ dashboardId }: { dashboardId: string }) => {
      const [parameters, setParameters] = useState<ParameterValues>({
        "filter-date": "past30days",
      });

      return (
        <>
          <button
            type="button"
            onClick={() =>
              setParameters((prev) => ({ ...prev, "filter-date": null }))
            }
          >
            clear date
          </button>
          <InteractiveDashboard
            dashboardId={dashboardId}
            parameters={parameters}
          />
        </>
      );
    };

    cy.get<string>("@dashboardId").then((dashboardId) => {
      mountSdkContent(<ClearableDashboard dashboardId={dashboardId} />);
    });

    cy.wait("@dashcardQuery");

    cy.contains("button", "clear date").click();

    cy.wait("@dashcardQuery").then(({ request }) => {
      // A cleared parameter may either be omitted from the body or sent
      // with `value: null` — accept both as long as no filter is applied.
      const dateParam = (request.body?.parameters ?? []).find(
        (p: { id: string }) => p.id === DATE_FILTER.id,
      );
      expect(dateParam?.value ?? null).to.equal(null);
    });

    findDateFilterValue().should("not.contain.text", "Previous 30 days");
  });

  it("does not call `onParametersChange` when host clears the dashboard's only parameter to null", () => {
    const onParametersChange = cy.spy().as("onParametersChange");

    const ClearableDashboard = ({ dashboardId }: { dashboardId: string }) => {
      const [parameters, setParameters] = useState<ParameterValues>({
        "filter-date": "past30days",
      });

      return (
        <>
          <button
            type="button"
            onClick={() =>
              setParameters((prev) => ({ ...prev, "filter-date": null }))
            }
          >
            clear date
          </button>
          <InteractiveDashboard
            dashboardId={dashboardId}
            parameters={parameters}
            onParametersChange={onParametersChange}
          />
        </>
      );
    };

    cy.get<string>("@dashboardId").then((dashboardId) => {
      mountSdkContent(<ClearableDashboard dashboardId={dashboardId} />);
    });

    cy.wait("@dashcardQuery");
    // initial-state has fired once.
    cy.get("@onParametersChange").should("have.been.calledOnce");

    cy.contains("button", "clear date").click();
    // The clear push is dispatched (the dashcard re-runs), proving the
    // controlled prop reached the dashboard.
    cy.wait("@dashcardQuery");
    cy.wait(500);

    // Still exactly one call — clearing a single scalar param is a perfect
    // round-trip (host's `null` ↔ payload's `null`), so no callback fires.
    cy.get("@onParametersChange").should("have.been.calledOnce");
  });

  it("does not emit `manual-change` when the user re-selects the same widget value", () => {
    const onParametersChange = cy.spy().as("onParametersChange");

    cy.get<string>("@dashboardId").then((dashboardId) => {
      mountSdkContent(
        <InteractiveDashboard
          dashboardId={dashboardId}
          onParametersChange={onParametersChange}
        />,
      );
    });

    cy.wait("@dashcardQuery");
    cy.get("@onParametersChange").should("have.been.calledOnce");

    // First selection — fires `manual-change`.
    getSdkRoot().within(() => {
      H.filterWidget().contains(DATE_FILTER.name).click();
    });
    H.popover().findByText("Previous 30 days").click();
    cy.wait("@dashcardQuery");

    cy.get("@onParametersChange").should("have.been.calledTwice");

    // Re-select the same option — should be a no-op for the listener
    // since applied values didn't change.
    getSdkRoot().within(() => {
      H.filterWidget().contains(DATE_FILTER.name).click();
    });
    H.popover().findByText("Update filter").click();

    cy.wait(500);

    cy.get("@onParametersChange").should("have.been.calledTwice");
  });
});
