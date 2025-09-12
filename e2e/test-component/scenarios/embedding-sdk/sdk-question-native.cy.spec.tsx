import { InteractiveQuestion } from "@metabase/embedding-sdk-react";
import { useState } from "react";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  createNativeQuestion,
  tableInteractiveBody,
} from "e2e/support/helpers";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import {
  mountInteractiveQuestion,
  mountSdkContent,
} from "e2e/support/helpers/embedding-sdk-component-testing";
import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/embedding-sdk-testing";
import { mockAuthProviderAndJwtSignIn } from "e2e/support/helpers/embedding-sdk-testing/embedding-sdk-helpers";
import { Box, Button } from "metabase/ui";
import type { DatasetColumn } from "metabase-types/api";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describe("scenarios > embedding-sdk > interactive-question > native", () => {
  beforeEach(() => {
    signInAsAdminAndEnableEmbeddingSdk();

    createNativeQuestion(
      {
        native: {
          query: "SELECT * FROM orders WHERE {{ID}}",
          "template-tags": {
            ID: {
              id: "6b8b10ef-0104-1047-1e1b-2492d5954322",
              name: "ID",
              "display-name": "ID",
              type: "dimension",
              dimension: ["field", ORDERS.ID, null],
              "widget-type": "category",
              default: null,
            },
          },
        },
      },
      { wrapId: true },
    );

    cy.signOut();
    mockAuthProviderAndJwtSignIn();
  });

  it("supports passing sql parameters to native questions", () => {
    mountInteractiveQuestion({ initialSqlParameters: { ID: ORDERS_ID } });

    cy.wait("@cardQuery").then(({ response }) => {
      const { body } = response ?? {};

      const rows = tableInteractiveBody().findAllByRole("row");

      // There should be one row in the table
      rows.should("have.length", 1);

      const idColumnIndex = body.data.cols.findIndex(
        (column: DatasetColumn) => column.name === "ID",
      );

      // The first row should have the same ID column value as the initial SQL parameters
      // eslint-disable-next-line no-unsafe-element-filtering
      rows
        .findAllByTestId("cell-data")
        .eq(idColumnIndex)
        .should("have.text", String(ORDERS_ID));
    });
  });

  it("should not crash when switching from new question to native question (metabase#60160)", () => {
    const TestComponent = ({
      nativeQuestionId,
    }: {
      nativeQuestionId: string | number;
    }) => {
      const [questionId, setQuestionId] = useState<string | number>("new");

      return (
        <Box>
          <InteractiveQuestion questionId={questionId} />

          <Button onClick={() => setQuestionId(nativeQuestionId)}>
            use native question
          </Button>
        </Box>
      );
    };

    cy.get<string>("@questionId").then((nativeQuestionId) => {
      mountSdkContent(<TestComponent nativeQuestionId={nativeQuestionId} />);

      getSdkRoot().within(() => {
        cy.findByText("Pick your starting data").should("be.visible");
      });

      cy.findByText("use native question").click();

      cy.log("should show native question table data");
      getSdkRoot().within(() => {
        cy.findByText("Pick your starting data").should("not.exist");
        cy.findByText("test question").should("be.visible");
        cy.findByText("110.93").should("be.visible");
      });

      cy.log("should not crash due to preview-query error");
      cy.on("uncaught:exception", (error) => {
        expect(
          error.message.includes(
            "preview-query cannot be called on native queries",
          ),
        ).to.be.false;
      });
    });
  });

  it("should not show filter/summarize/breakout buttons for native questions", () => {
    mountInteractiveQuestion({});

    getSdkRoot().within(() => {
      cy.log("should show native question data");
      cy.findByText("test question").should("be.visible");

      cy.log("should not show Filter button");
      cy.findByText("Filter").should("not.exist");

      cy.log("should not show Summarize button");
      cy.findByText("Summarize").should("not.exist");

      cy.log("should not show Group button");
      cy.findByText("Group").should("not.exist");
    });
  });
});
