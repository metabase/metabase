import { InteractiveQuestion } from "@metabase/embedding-sdk-react";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ADMIN_PERSONAL_COLLECTION_ID,
  FIRST_COLLECTION_ENTITY_ID,
  FIRST_COLLECTION_ID,
  ORDERS_DASHBOARD_ID,
  ORDERS_MODEL_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  assertSdkNotebookEditorUsable,
  createQuestion,
  entityPickerModal,
  modal,
  popover,
} from "e2e/support/helpers";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import { mountSdkContent } from "e2e/support/helpers/embedding-sdk-component-testing/component-embedding-sdk-helpers";
import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/embedding-sdk-testing";
import { mockAuthProviderAndJwtSignIn } from "e2e/support/helpers/embedding-sdk-testing/embedding-sdk-helpers";
import { createLibraryWithTable } from "e2e/support/test-library-data";
import type { SearchResponse } from "metabase-types/api";

const { H } = cy;

describe("scenarios > embedding-sdk > interactive-question > creating a question", () => {
  beforeEach(() => {
    signInAsAdminAndEnableEmbeddingSdk();
  });

  it("can create a question via the InteractiveQuestion component", () => {
    cy.signOut();
    mockAuthProviderAndJwtSignIn();
    cy.intercept("POST", "/api/card").as("createCard");

    mountSdkContent(
      <div style={{ display: "flex", padding: "20px" }}>
        <InteractiveQuestion questionId="new" />
      </div>,
    );

    assertSdkNotebookEditorUsable();

    getSdkRoot().within(() => {
      // Should be able to save to a new question right away
      cy.findByRole("button", { name: "Save" }).click();
    });

    modal().within(() => {
      cy.findByPlaceholderText("What is the name of your question?")
        .clear()
        .type("My Orders");

      cy.findByTestId("dashboard-and-collection-picker-button").click();
    });

    entityPickerModal().within(() => {
      cy.findByText("First collection").click();
      cy.button("Select this collection").click();
    });

    modal().button("Save").click();

    cy.wait("@createCard").then(({ response }) => {
      expect(response?.statusCode).to.equal(200);
      expect(response?.body.name).to.equal("My Orders");
      expect(response?.body?.dashboard_id).to.equal(null);
      expect(response?.body?.collection_id).to.equal(FIRST_COLLECTION_ID);
    });

    // The question title's header should be updated.
    getSdkRoot().contains("My Orders");
  });

  it("can create a question without visualizing it first (EMB-584)", () => {
    cy.signOut();
    mockAuthProviderAndJwtSignIn();

    mountSdkContent(
      <div style={{ display: "flex", padding: "20px" }}>
        <InteractiveQuestion questionId="new" />
      </div>,
    );

    getSdkRoot().within(() => {
      cy.button("Save").should("not.exist");
    });

    popover().findByRole("link", { name: "Orders" }).click();

    getSdkRoot().button("Save").should("be.visible").click();

    const expectedQuestionName = "Orders question";
    modal().within(() => {
      cy.findByRole("heading", { name: "Save new question" }).should(
        "be.visible",
      );
      cy.findByLabelText("Name").clear().type(expectedQuestionName);
      cy.button("Save").click();
    });

    getSdkRoot().findByText(expectedQuestionName).should("be.visible");
    getSdkRoot().findByTestId("visualization-root").should("be.visible");
  });

  it("can save a question in a dashboard", () => {
    createQuestion({
      name: "Total Orders",
      dashboard_id: ORDERS_DASHBOARD_ID,
      query: {
        "source-table": SAMPLE_DATABASE.ORDERS_ID,
        aggregation: [["count"]],
      },
      display: "scalar",
    });

    cy.signOut();
    mockAuthProviderAndJwtSignIn();
    cy.intercept("POST", "/api/card").as("createCard");

    mountSdkContent(
      <div style={{ display: "flex", padding: "20px" }}>
        <InteractiveQuestion questionId="new" />
      </div>,
    );

    // Wait until the entity picker modal is visible
    getSdkRoot().contains("Pick your starting data");

    popover().within(() => {
      cy.findByText("Orders").click();
    });

    getSdkRoot().within(() => {
      cy.findByRole("button", { name: "Visualize" }).click();

      // Should not show a loading indicator again as the question has not changed (metabase#47564)
      cy.findByTestId("loading-indicator").should("not.exist");

      // Should show a visualization after clicking "Visualize"
      // and should not show an error message (metabase#55398)
      cy.findByText("Question not found").should("not.exist");
      cy.findByText("110.93").should("be.visible"); // table data

      // Should be able to save to a new question right away
      cy.findByRole("button", { name: "Save" }).click();
    });

    modal().within(() => {
      cy.findByPlaceholderText("What is the name of your question?")
        .clear()
        .type("My Orders");

      cy.findByTestId("dashboard-and-collection-picker-button").click();
    });

    entityPickerModal().within(() => {
      cy.findByText("Orders in a dashboard").click();
      cy.button("Select this dashboard").click();
    });

    modal().button("Save").click();

    cy.wait("@createCard").then(({ response }) => {
      expect(response?.statusCode).to.equal(200);
      expect(response?.body.name).to.equal("My Orders");
      expect(response?.body?.dashboard_id).to.equal(ORDERS_DASHBOARD_ID);
      expect(response?.body?.collection_id).to.equal(null);
    });

    // The question title's header should be updated.
    getSdkRoot().contains("My Orders");
  });

  it("should respect `entityTypes` prop", () => {
    cy.signOut();
    mockAuthProviderAndJwtSignIn();
    cy.intercept("POST", "/api/card").as("createCard");

    /**
     * We have changed the default MB_SEARCH_ENGINE from "in-place" to "appdb", and it affects the results here.
     * Previously, when the engine was "in-place", we'll get models from the "Usage Analytics" collection as well,
     * so the number was different.
     */
    const MODEL_COUNT = 1;
    const TABLE_COUNT = 4;

    cy.log('1. `entityTypes` = ["table"]');
    mountSdkContent(
      <div style={{ display: "flex", padding: "20px" }}>
        <InteractiveQuestion questionId="new" entityTypes={["table"]} />
      </div>,
    );

    // Wait until the entity picker modal is visible
    getSdkRoot().contains("Pick your starting data");

    H.popover().within(() => {
      cy.findByRole("link", { name: "Orders" }).should("be.visible");
      cy.findByRole("link", { name: "Orders Model" }).should("not.exist");
      cy.findAllByRole("link").should("have.length", TABLE_COUNT);
    });

    cy.log('2. `entityTypes` = ["model"]');
    mountSdkContent(
      <div style={{ display: "flex", padding: "20px" }}>
        <InteractiveQuestion questionId="new" entityTypes={["model"]} />
      </div>,
    );

    // Wait until the entity picker modal is visible
    getSdkRoot().contains("Pick your starting data");

    H.popover().within(() => {
      cy.findByRole("link", { name: "Orders" }).should("not.exist");
      cy.findByRole("link", { name: "Orders Model" }).should("be.visible");
      cy.findAllByRole("link").should("have.length", MODEL_COUNT);
    });

    cy.log('3. `entityTypes` = ["model", "table]');
    mountSdkContent(
      <div style={{ display: "flex", padding: "20px" }}>
        <InteractiveQuestion
          questionId="new"
          entityTypes={["model", "table"]}
        />
      </div>,
    );

    // Wait until the entity picker modal is visible
    getSdkRoot().contains("Pick your starting data");

    H.popover().within(() => {
      cy.findByRole("link", { name: "Orders" }).should("be.visible");
      cy.findByRole("link", { name: "Orders Model" }).should("be.visible");
      cy.findAllByRole("link").should("have.length", MODEL_COUNT + TABLE_COUNT);
    });
  });

  it('should list only what is published in the semantic layer when `entityTypes` = ["semantic-layer"]', () => {
    // Publishes only Orders
    createLibraryWithTable();
    cy.signOut();
    mockAuthProviderAndJwtSignIn();

    mountSdkContent(
      <div style={{ display: "flex", padding: "20px" }}>
        <InteractiveQuestion
          questionId="new"
          entityTypes={["semantic-layer"]}
        />
      </div>,
    );

    getSdkRoot().findByText("Pick your starting data").should("be.visible");

    cy.log(
      "list the table published in the semantic layer, not the raw tables",
    );
    H.popover().within(() => {
      cy.findByRole("link", { name: "Orders" }).should("be.visible");
      cy.findByRole("link", { name: "Reviews" }).should("not.exist");
    });

    cy.log("select the published table");
    H.popover().findByRole("link", { name: "Orders" }).click();
    getSdkRoot().within(() => {
      H.getNotebookStep("data").findByText("Orders").should("be.visible");
    });
  });

  it('should list only what is published in the semantic layer in the staged picker when `entityTypes` = ["semantic-layer"]', () => {
    // Publishes only Orders
    createLibraryWithTable();
    cy.signOut();
    mockAuthProviderAndJwtSignIn();

    mountSdkContent(
      <div style={{ display: "flex", padding: "20px" }}>
        <InteractiveQuestion
          questionId="new"
          dataPicker="staged"
          entityTypes={["semantic-layer"]}
        />
      </div>,
    );

    getSdkRoot().findByText("Pick your starting data").should("be.visible");

    cy.log(
      "open on the semantic layer's tables, not the bucket step or the raw tables",
    );
    H.popover().within(() => {
      cy.findByTestId("saved-entity-title").should("have.text", "Data");
      cy.findByText("Orders").should("be.visible");
      cy.findByText("Reviews").should("not.exist");
      cy.findByText("Raw Data").should("not.exist");
    });

    cy.log("select the published table");
    H.popover().findByText("Orders").click();
    getSdkRoot().within(() => {
      H.getNotebookStep("data").findByText("Orders").should("be.visible");
    });
  });

  it('should list a table published in a semantic layer subfolder when `entityTypes` = ["semantic-layer"]', () => {
    // Publishes only Orders, into Semantic layer > Data > Customer A
    H.createLibrary().then(({ body: library }) => {
      const dataCollection = library.effective_children?.find(
        (collection) => collection.type === "library-data",
      );

      H.createCollection({
        name: "Customer A",
        parent_id: dataCollection?.id,
      }).then(({ body: subfolder }) => {
        H.publishTables({
          table_ids: [SAMPLE_DATABASE.ORDERS_ID],
          collection_id: subfolder.id,
        });

        // The search index catches up with the publish asynchronously, and the
        // picker searches the semantic layer only once, when it opens
        H.retryRequest(
          () =>
            cy.request<SearchResponse>(
              `/api/search?collection=${subfolder.id}&models=table`,
            ),
          ({ body }) => body.data.some((result) => result.name === "Orders"),
        );
      });
    });
    cy.signOut();
    mockAuthProviderAndJwtSignIn();

    mountSdkContent(
      <div style={{ display: "flex", padding: "20px" }}>
        <InteractiveQuestion
          questionId="new"
          entityTypes={["semantic-layer"]}
        />
      </div>,
    );

    getSdkRoot().findByText("Pick your starting data").should("be.visible");

    cy.log("list the table published in the subfolder, not the raw tables");
    H.popover().within(() => {
      cy.findByRole("link", { name: "Orders" }).should("be.visible");
      cy.findByRole("link", { name: "Reviews" }).should("not.exist");
    });
  });

  it('should show an empty state in the staged picker, not the raw tables, when `entityTypes` = ["semantic-layer"] and nothing is published', () => {
    H.createLibrary();
    cy.signOut();
    mockAuthProviderAndJwtSignIn();

    mountSdkContent(
      <div style={{ display: "flex", padding: "20px" }}>
        <InteractiveQuestion
          questionId="new"
          dataPicker="staged"
          entityTypes={["semantic-layer"]}
        />
      </div>,
    );

    getSdkRoot().findByText("Pick your starting data").should("be.visible");

    H.popover().within(() => {
      cy.findByText("To pick some data, you'll need to add some first").should(
        "be.visible",
      );
      cy.findByText("Sample Database").should("not.exist");
      cy.findByText("Orders").should("not.exist");
    });
  });

  it('should keep a join in the staged picker to the semantic layer when `entityTypes` = ["semantic-layer"]', () => {
    // Publishes only Orders
    createLibraryWithTable();
    cy.signOut();
    mockAuthProviderAndJwtSignIn();

    mountSdkContent(
      <div style={{ display: "flex", padding: "20px" }}>
        <InteractiveQuestion
          questionId="new"
          dataPicker="staged"
          entityTypes={["semantic-layer"]}
        />
      </div>,
    );

    getSdkRoot().findByText("Pick your starting data").should("be.visible");

    H.popover().findByText("Orders").click();
    getSdkRoot().within(() => {
      cy.button("Join data").click();
    });

    cy.log("the join lists the table published in the semantic layer");
    H.popover().within(() => {
      cy.findByText("Orders").should("be.visible");
      cy.findByText("Reviews").should("not.exist");
    });

    cy.log("there is no way back out of the semantic layer");
    H.popover().within(() => {
      cy.findByTestId("saved-entity-title").should("have.text", "Data");
      cy.findByTestId("saved-entity-back-navigation").should("not.exist");
    });
  });

  it('should open the tables, not the models, in the staged picker when reopened on a model and `entityTypes` = ["table"]', () => {
    createQuestion({
      query: { "source-table": `card__${ORDERS_MODEL_ID}` },
    }).then(({ body: question }) => {
      cy.signOut();
      mockAuthProviderAndJwtSignIn();

      mountSdkContent(
        <div style={{ display: "flex", padding: "20px" }}>
          <InteractiveQuestion
            questionId={question.id}
            dataPicker="staged"
            entityTypes={["table"]}
          />
        </div>,
      );
    });

    getSdkRoot().within(() => {
      cy.findByTestId("notebook-button").click();
      cy.findByTestId("step-data-0-0").findByText("Orders Model").click();
    });

    H.popover().within(() => {
      cy.findByText("Sample Database").should("be.visible");
      cy.findByText("Orders").should("be.visible");
      cy.findByText("Models").should("not.exist");
    });
  });

  [
    {
      targetCollectionId: "personal",
      respondedCollectionId: ADMIN_PERSONAL_COLLECTION_ID,
    },
    {
      targetCollectionId: FIRST_COLLECTION_ENTITY_ID,
      respondedCollectionId: FIRST_COLLECTION_ID,
    },
  ].forEach(({ targetCollectionId, respondedCollectionId }) => {
    it(`can create a question in a collection passing the \`${targetCollectionId}\` as a target collection id (metabase#64584)`, () => {
      cy.signOut();
      mockAuthProviderAndJwtSignIn();
      cy.intercept("POST", "/api/card").as("createCard");

      mountSdkContent(
        <div style={{ display: "flex", padding: "20px" }}>
          <InteractiveQuestion
            questionId="new"
            targetCollection={targetCollectionId}
          />
        </div>,
      );

      assertSdkNotebookEditorUsable();

      getSdkRoot().within(() => {
        // Should be able to save to a new question right away
        cy.findByRole("button", { name: "Save" }).click();
      });

      modal().within(() => {
        cy.findByPlaceholderText("What is the name of your question?")
          .clear()
          .type("My Orders");
      });

      modal().button("Save").click();

      cy.wait("@createCard").then(({ response }) => {
        expect(response?.statusCode).to.equal(200);
        expect(response?.body.name).to.equal("My Orders");
        expect(response?.body?.dashboard_id).to.equal(null);
        expect(response?.body?.collection_id).to.equal(respondedCollectionId);
      });

      // The question title's header should be updated.
      getSdkRoot().contains("My Orders");
    });
  });

  it("should show columns from joined table when there is no FK relationship (metabase#EMB-1102)", () => {
    cy.signOut();
    mockAuthProviderAndJwtSignIn();

    mountSdkContent(
      <div style={{ display: "flex", padding: "20px" }}>
        <InteractiveQuestion questionId="new" />
      </div>,
    );

    popover().within(() => {
      cy.findByText("Orders").click();
    });

    getSdkRoot().within(() => {
      cy.button("Join data").click();
    });

    popover().within(() => {
      cy.findByText("Reviews").click();
    });

    popover().within(() => {
      cy.findByText("ID").click();
    });

    popover().within(() => {
      cy.findByText("Product ID").should("be.visible");
      cy.findByText("Reviewer").should("be.visible");
      cy.findByText("Custom Expression").should("be.visible");
    });
  });
});
