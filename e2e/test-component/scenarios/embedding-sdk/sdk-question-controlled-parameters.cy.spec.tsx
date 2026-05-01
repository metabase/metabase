import {
  InteractiveQuestion,
  type SqlParameterValues,
} from "@metabase/embedding-sdk-react";
import { useState } from "react";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  type NativeQuestionDetails,
  createNativeQuestion,
} from "e2e/support/helpers";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import {
  mountInteractiveQuestion,
  mountSdkContent,
} from "e2e/support/helpers/embedding-sdk-component-testing";
import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/embedding-sdk-testing";
import { mockAuthProviderAndJwtSignIn } from "e2e/support/helpers/embedding-sdk-testing/embedding-sdk-helpers";
import type { TemplateTags } from "metabase-types/api";
import { createMockParameter } from "metabase-types/api/mocks";

const { H } = cy;
const { PEOPLE } = SAMPLE_DATABASE;

const TEMPLATE_TAGS: TemplateTags = {
  state: {
    id: "state",
    name: "state",
    "display-name": "State",
    type: "dimension",
    "widget-type": "string/=",
    dimension: ["field", PEOPLE.STATE, null],
  },
  city: {
    id: "city",
    name: "city",
    "display-name": "City",
    type: "dimension",
    "widget-type": "string/=",
    dimension: ["field", PEOPLE.CITY, null],
  },
  source: {
    id: "source",
    name: "source",
    "display-name": "Source",
    type: "dimension",
    "widget-type": "string/=",
    dimension: ["field", PEOPLE.SOURCE, null],
  },
};

const PARAMETERS = [
  createMockParameter({
    id: "state",
    name: "State",
    slug: "state",
    type: "string/=",
    target: ["dimension", ["template-tag", "state"]],
  }),
  createMockParameter({
    id: "city",
    name: "City",
    slug: "city",
    type: "string/=",
    target: ["dimension", ["template-tag", "city"]],
  }),
  createMockParameter({
    id: "source",
    name: "Source",
    slug: "source",
    type: "string/=",
    target: ["dimension", ["template-tag", "source"]],
  }),
];

const NATIVE_QUESTION: NativeQuestionDetails = {
  name: "Controlled SQL parameters native question",
  native: {
    query:
      "SELECT * FROM PEOPLE WHERE {{state}} [[ AND {{city}} ]] [[ AND {{source}} ]]",
    "template-tags": TEMPLATE_TAGS,
  },
  parameters: PARAMETERS,
};

const setup = () => {
  signInAsAdminAndEnableEmbeddingSdk();
  createNativeQuestion(NATIVE_QUESTION, { wrapId: true });
  cy.signOut();
  mockAuthProviderAndJwtSignIn();
};

const childrenLayout = (
  <>
    <InteractiveQuestion.SqlParametersList />
    <InteractiveQuestion.QuestionVisualization />
  </>
);

const findParameterWidget = (name: string) =>
  getSdkRoot()
    .findAllByTestId("parameter-widget")
    .filter(`:contains("${name}")`);

describe("scenarios > embedding-sdk > sdk-question > controlled SQL parameters", () => {
  beforeEach(setup);

  it("applies values pushed via the `sqlParameters` prop to the widgets and the table", () => {
    mountInteractiveQuestion({
      sqlParameters: { state: "AR" },
      children: childrenLayout,
    });

    cy.wait("@cardQuery");

    findParameterWidget("State").should("contain.text", "AR");

    H.ensureParameterColumnValue({
      columnName: "STATE",
      columnValue: "AR",
    });
  });

  it("re-runs the query when the `sqlParameters` prop reference changes", () => {
    const SwitchableQuestion = ({
      questionId,
    }: {
      questionId: number | string;
    }) => {
      const [sqlParameters, setSqlParameters] = useState<SqlParameterValues>({
        state: "AR",
      });

      return (
        <>
          <button
            type="button"
            onClick={() => setSqlParameters({ state: "TX" })}
          >
            switch to TX
          </button>
          <InteractiveQuestion
            questionId={questionId}
            sqlParameters={sqlParameters}
          >
            {childrenLayout}
          </InteractiveQuestion>
        </>
      );
    };

    cy.intercept("GET", "/api/card/*").as("getCard");
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");

    cy.get<number>("@questionId").then((questionId) => {
      mountSdkContent(<SwitchableQuestion questionId={questionId} />);
    });

    cy.wait("@getCard");
    cy.wait("@cardQuery");

    H.ensureParameterColumnValue({
      columnName: "STATE",
      columnValue: "AR",
    });

    cy.findByText("switch to TX").click();

    cy.wait("@cardQuery");

    findParameterWidget("State").should("contain.text", "TX");

    H.ensureParameterColumnValue({
      columnName: "STATE",
      columnValue: "TX",
    });
  });

  it("fires `onSqlParametersChange` with `source: 'initial-state'` exactly once on load", () => {
    const onSqlParametersChange = cy.spy().as("onSqlParametersChange");

    mountInteractiveQuestion({
      sqlParameters: { state: "AR" },
      onSqlParametersChange,
      children: childrenLayout,
    });

    cy.wait("@cardQuery");

    cy.get("@onSqlParametersChange").should("have.been.calledOnce");
    cy.get("@onSqlParametersChange")
      .its("firstCall.args.0")
      .should((payload) => {
        expect(payload.source).to.equal("initial-state");
        expect(payload.parameters).to.deep.include({ state: ["AR"] });
        expect(payload.defaultParameters).to.be.an("object");
        // Question payload spec omits `lastUsedParameters` entirely.
        expect(payload).to.not.have.property("lastUsedParameters");
      });
  });

  it("fires `onSqlParametersChange` with `source: 'manual-change'` when the user edits a filter widget", () => {
    const onSqlParametersChange = cy.spy().as("onSqlParametersChange");

    mountInteractiveQuestion({
      sqlParameters: { state: "AR" },
      onSqlParametersChange,
      children: childrenLayout,
    });

    cy.wait("@cardQuery");
    cy.get("@onSqlParametersChange").should("have.been.calledOnce");

    findParameterWidget("State").click();
    cy.findByTestId("parameter-value-dropdown").within(() => {
      cy.findByText("AR").click();
      cy.findByText("NY").click();
      cy.findByText("Update filter").click();
    });

    cy.wait("@cardQuery");

    cy.get("@onSqlParametersChange")
      .its("lastCall.args.0")
      .should((payload) => {
        expect(payload.source).to.equal("manual-change");
        expect(payload.parameters).to.deep.include({ state: ["NY"] });
      });
  });

  it("fires `onSqlParametersChange` with `source: 'manual-change'` when values are pushed programmatically", () => {
    const onSqlParametersChange = cy.spy().as("onSqlParametersChange");

    const PushButton = ({ questionId }: { questionId: number | string }) => {
      const [sqlParameters, setSqlParameters] = useState<SqlParameterValues>({
        state: "AR",
      });

      return (
        <>
          <button
            type="button"
            onClick={() => setSqlParameters({ state: "WA" })}
          >
            push WA
          </button>
          <InteractiveQuestion
            questionId={questionId}
            sqlParameters={sqlParameters}
            onSqlParametersChange={onSqlParametersChange}
          >
            {childrenLayout}
          </InteractiveQuestion>
        </>
      );
    };

    cy.intercept("GET", "/api/card/*").as("getCard");
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");

    cy.get<number>("@questionId").then((questionId) => {
      mountSdkContent(<PushButton questionId={questionId} />);
    });

    cy.wait("@getCard");
    cy.wait("@cardQuery");

    cy.get("@onSqlParametersChange")
      .its("firstCall.args.0")
      .should("include", { source: "initial-state" });

    cy.findByText("push WA").click();

    cy.wait("@cardQuery");

    cy.get("@onSqlParametersChange")
      .its("lastCall.args.0")
      .should((payload) => {
        expect(payload.source).to.equal("manual-change");
        expect(payload.parameters).to.deep.include({ state: ["WA"] });
      });
  });

  it("does not fire a redundant `manual-change` after `initial-state` when the seed equals the resolved values", () => {
    const onSqlParametersChange = cy.spy().as("onSqlParametersChange");

    mountInteractiveQuestion({
      sqlParameters: { state: "AR" },
      onSqlParametersChange,
      children: childrenLayout,
    });

    cy.wait("@cardQuery");

    cy.wait(500);

    cy.get("@onSqlParametersChange").should("have.been.calledOnce");
  });

  it("emits `manual-change` with `null` value when host pushes an explicit null", () => {
    const onSqlParametersChange = cy.spy().as("onSqlParametersChange");

    const ClearableQuestion = ({
      questionId,
    }: {
      questionId: number | string;
    }) => {
      const [sqlParameters, setSqlParameters] = useState<SqlParameterValues>({
        state: "AR",
        city: "El Paso",
      });

      return (
        <>
          <button
            type="button"
            onClick={() =>
              setSqlParameters((prev) => ({ ...prev, city: null }))
            }
          >
            clear city
          </button>
          <InteractiveQuestion
            questionId={questionId}
            sqlParameters={sqlParameters}
            onSqlParametersChange={onSqlParametersChange}
          >
            {childrenLayout}
          </InteractiveQuestion>
        </>
      );
    };

    cy.intercept("GET", "/api/card/*").as("getCard");
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");

    cy.get<number>("@questionId").then((questionId) => {
      mountSdkContent(<ClearableQuestion questionId={questionId} />);
    });

    cy.wait("@getCard");
    cy.wait("@cardQuery");

    cy.findByText("clear city").click();
    cy.wait("@cardQuery");

    cy.get("@onSqlParametersChange")
      .its("lastCall.args.0")
      .should((payload) => {
        expect(payload.source).to.equal("manual-change");
        expect(payload.parameters.city).to.equal(null);
      });
  });

  it("clears a single parameter when its value is set to null", () => {
    const ClearableQuestion = ({
      questionId,
    }: {
      questionId: number | string;
    }) => {
      const [sqlParameters, setSqlParameters] = useState<SqlParameterValues>({
        state: "AR",
        city: "El Paso",
      });

      return (
        <>
          <button
            type="button"
            onClick={() =>
              setSqlParameters((prev) => ({ ...prev, city: null }))
            }
          >
            clear city
          </button>
          <InteractiveQuestion
            questionId={questionId}
            sqlParameters={sqlParameters}
          >
            {childrenLayout}
          </InteractiveQuestion>
        </>
      );
    };

    cy.intercept("GET", "/api/card/*").as("getCard");
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");

    cy.get<number>("@questionId").then((questionId) => {
      mountSdkContent(<ClearableQuestion questionId={questionId} />);
    });

    cy.wait("@getCard");
    cy.wait("@cardQuery");

    findParameterWidget("City").should("contain.text", "El Paso");

    cy.findByText("clear city").click();

    cy.wait("@cardQuery");

    findParameterWidget("City").should("not.contain.text", "El Paso");

    // The required `state` filter is still applied → STATE column = AR.
    H.ensureParameterColumnValue({
      columnName: "STATE",
      columnValue: "AR",
    });
  });
});
