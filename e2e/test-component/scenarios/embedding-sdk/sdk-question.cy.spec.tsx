import { useDisclosure } from "@mantine/hooks";
import {
  InteractiveQuestion,
  type MetabaseQuestion,
} from "@metabase/embedding-sdk-react";
import { type ComponentProps, useState } from "react";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  FIRST_COLLECTION_ENTITY_ID,
  FIRST_COLLECTION_ID,
  ORDERS_QUESTION_ID,
  SECOND_COLLECTION_ENTITY_ID,
  THIRD_COLLECTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  METABASE_INSTANCE_URL,
  createQuestion,
  popover,
  tableAllFieldsHiddenImage,
  tableHeaderClick,
  tableInteractive,
} from "e2e/support/helpers";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import { saveInteractiveQuestionAsNewQuestion } from "e2e/support/helpers/e2e-embedding-sdk-interactive-question-helpers";
import {
  mountInteractiveQuestion,
  mountSdkContent,
  mountSdkContentAndAssertNoKnownErrors,
} from "e2e/support/helpers/embedding-sdk-component-testing";
import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/embedding-sdk-testing";
import { mockAuthProviderAndJwtSignIn } from "e2e/support/helpers/embedding-sdk-testing/embedding-sdk-helpers";
import { Box, Button, Modal } from "metabase/ui";
const { H } = cy;

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

type InteractiveQuestionProps = ComponentProps<typeof InteractiveQuestion>;

describe("scenarios > embedding-sdk > interactive-question", () => {
  beforeEach(() => {
    signInAsAdminAndEnableEmbeddingSdk();

    createQuestion({
      name: "47563",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["max", ["field", ORDERS.QUANTITY, null]]],
        breakout: [["field", ORDERS.PRODUCT_ID, null]],
        limit: 2,
      },
    }).then(({ body: question }) => {
      cy.wrap(question.id).as("questionId");
      cy.wrap(question.entity_id).as("questionEntityId");
    });

    cy.signOut();

    mockAuthProviderAndJwtSignIn();
  });

  it("should show question content", () => {
    mountInteractiveQuestion();

    getSdkRoot().within(() => {
      cy.findByText("Product ID").should("be.visible");
      cy.findByText("Max of Quantity").should("be.visible");
    });
  });

  it("should show a watermark in development mode", () => {
    cy.intercept("/api/session/properties", (req) => {
      req.continue((res) => {
        res.body["token-features"].development_mode = true;
      });
    });

    mountInteractiveQuestion();

    getSdkRoot().within(() => {
      cy.findByTestId("development-watermark").should("exist");
    });
  });

  it("uses the embedding-sdk-react client request header", () => {
    mountInteractiveQuestion();

    cy.wait("@cardQuery").then(({ request }) => {
      expect(request?.headers?.["x-metabase-client"]).to.equal(
        "embedding-sdk-react",
      );
    });
  });

  it("should not fail on aggregated question drill", () => {
    mountInteractiveQuestion();

    cy.wait("@cardQuery").then(({ response }) => {
      expect(response?.statusCode).to.equal(202);
    });

    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    cy.findAllByTestId("cell-data").last().click();

    cy.on("uncaught:exception", (error) => {
      expect(
        error.message.includes(
          "Error converting :aggregation reference: no aggregation at index 0",
        ),
      ).to.be.false;
    });

    popover().findByText("See these Orders").click();

    cy.icon("warning").should("not.exist");
  });

  it("should be able to hide columns from a table", () => {
    mountInteractiveQuestion();

    cy.wait("@cardQuery").then(({ response }) => {
      expect(response?.statusCode).to.equal(202);
    });

    const firstColumnName = "Product ID";
    const lastColumnName = "Max of Quantity";
    const columnNames = [firstColumnName, lastColumnName];

    columnNames.forEach((columnName) => {
      tableInteractive().findByText(columnName).should("be.visible");

      tableHeaderClick(columnName);

      popover()
        .findByTestId("click-actions-sort-control-formatting-hide")
        .click();

      const lastColumnName = "Max of Quantity";

      if (columnName !== lastColumnName) {
        tableInteractive().findByText(columnName).should("not.exist");
      } else {
        tableInteractive().should("not.exist");

        tableAllFieldsHiddenImage()
          .should("be.visible")
          .should("have.attr", "src")
          .and("include", METABASE_INSTANCE_URL);
      }
    });
  });

  it("can save a question to a default collection", () => {
    mountInteractiveQuestion();

    saveInteractiveQuestionAsNewQuestion({
      entityName: "Orders",
      questionName: "Sample Orders 1",
    });

    cy.wait("@createCard").then(({ response }) => {
      expect(response?.statusCode).to.equal(200);
      expect(response?.body.name).to.equal("Sample Orders 1");
      expect(response?.body.collection_id).to.equal(null);
    });
  });

  it("can save a question to a selected collection", () => {
    mountInteractiveQuestion();

    saveInteractiveQuestionAsNewQuestion({
      entityName: "Orders",
      questionName: "Sample Orders 2",
      collectionPickerPath: ["Our analytics", "First collection"],
    });

    cy.wait("@createCard").then(({ response }) => {
      expect(response?.statusCode).to.equal(200);
      expect(response?.body.name).to.equal("Sample Orders 2");
      expect(response?.body.collection_id).to.equal(FIRST_COLLECTION_ID);
    });
  });

  it("can save a question to a pre-defined collection", () => {
    mountInteractiveQuestion({
      targetCollection: Number(THIRD_COLLECTION_ID),
    });

    saveInteractiveQuestionAsNewQuestion({
      entityName: "Orders",
      questionName: "Sample Orders 3",
    });

    cy.wait("@createCard").then(({ response }) => {
      expect(response?.statusCode).to.equal(200);
      expect(response?.body.name).to.equal("Sample Orders 3");
      expect(response?.body.collection_id).to.equal(THIRD_COLLECTION_ID);
    });
  });

  it("can save a question to their personal collection", () => {
    cy.intercept("/api/user/current").as("getUser");

    mountInteractiveQuestion({
      targetCollection: "personal",
    });

    cy.wait("@getUser").then(({ response: userResponse }) => {
      saveInteractiveQuestionAsNewQuestion({
        entityName: "Orders",
        questionName: "Sample Orders 3",
      });
      const userCollection = userResponse?.body.personal_collection_id;
      cy.wait("@createCard").then(({ response }) => {
        expect(response?.statusCode).to.equal(200);
        expect(response?.body.name).to.equal("Sample Orders 3");
        expect(response?.body.collection_id).to.equal(userCollection);
      });
    });
  });

  it("can add a filter via the FilterPicker component", () => {
    cy.intercept("GET", "/api/card/*").as("getCard");
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");

    const TestSuiteComponent = ({ questionId }: { questionId: string }) => (
      <Box p="lg">
        <InteractiveQuestion questionId={questionId}>
          <Box>
            <InteractiveQuestion.FilterDropdown />
            <InteractiveQuestion.QuestionVisualization />
          </Box>
        </InteractiveQuestion>
      </Box>
    );

    cy.get<string>("@questionId").then((questionId) => {
      mountSdkContent(<TestSuiteComponent questionId={questionId} />);
    });

    cy.wait("@getCard").then(({ response }) => {
      expect(response?.statusCode).to.equal(200);
    });

    getSdkRoot().findByText("Filter").click();

    popover().within(() => {
      cy.findByText("User ID").click();
      cy.findByPlaceholderText("Enter an ID").type("12");
      cy.findByText("Add filter").click();

      cy.findByText("User ID is 12").should("be.visible");
      cy.findByText("Add another filter").should("be.visible");
    });
  });

  it("can create questions via the SaveQuestionForm component", () => {
    const TestComponent = ({
      questionId,
      onBeforeSave,
      onSave,
    }: InteractiveQuestionProps) => {
      const [isSaveModalOpen, { toggle, close }] = useDisclosure(false);

      const handleSave = (
        question: MetabaseQuestion | undefined,
        context: { isNewQuestion: boolean },
      ) => {
        if (context.isNewQuestion) {
          onSave(question?.name ?? "");
        }

        close();
      };

      return (
        <InteractiveQuestion
          questionId={questionId}
          isSaveEnabled
          onBeforeSave={onBeforeSave}
          onSave={handleSave}
        >
          <Box p="lg">
            <Button onClick={toggle}>Save</Button>
          </Box>

          {isSaveModalOpen && (
            <Modal opened={isSaveModalOpen} onClose={close}>
              <InteractiveQuestion.SaveQuestionForm onCancel={close} />
            </Modal>
          )}

          {!isSaveModalOpen && <InteractiveQuestion.QuestionVisualization />}
        </InteractiveQuestion>
      );
    };

    const onBeforeSaveSpy = cy.spy().as("onBeforeSaveSpy");
    const onSaveSpy = cy.spy().as("onSaveSpy");

    cy.get("@questionId").then((questionId) => {
      mountSdkContent(
        <TestComponent
          questionId={questionId}
          onBeforeSave={onBeforeSaveSpy}
          onSave={onSaveSpy}
        />,
      );
    });

    saveInteractiveQuestionAsNewQuestion({
      entityName: "Orders",
      questionName: "Sample Orders 4",
    });

    cy.wait("@createCard").then(({ response }) => {
      expect(response?.statusCode).to.equal(200);
      expect(response?.body.name).to.equal("Sample Orders 4");
    });

    cy.get("@onBeforeSaveSpy").should("have.been.calledOnce");
    cy.get("@onSaveSpy").should("have.been.calledWith", "Sample Orders 4");
  });

  it("should not crash when clicking on Summarize (metabase#50398)", () => {
    mountInteractiveQuestion();

    cy.wait("@cardQuery").then(({ response }) => {
      expect(response?.statusCode).to.equal(202);
    });

    getSdkRoot().within(() => {
      // Open the default summarization view in the sdk
      cy.findByText("1 summary").click();
    });

    popover().findByText("Add another summary").click();

    // Expect the default summarization view to be there.
    cy.findByTestId("aggregation-picker").should("be.visible");

    cy.on("uncaught:exception", (error) => {
      expect(error.message.includes("Stage 1 does not exist")).to.be.false;
    });
  });

  it("does not contain known console errors (metabase#48497)", () => {
    cy.get<number>("@questionId").then((questionId) => {
      mountSdkContentAndAssertNoKnownErrors(
        <InteractiveQuestion questionId={questionId} />,
      );
    });
  });

  describe("loading behavior for both entity IDs and number IDs (metabase#49581)", () => {
    const successTestCases = [
      {
        name: "correct entity ID",
        questionIdAlias: "@questionEntityId",
      },
      {
        name: "correct number ID",
        questionIdAlias: "@questionId",
      },
    ];

    const failureTestCases = [
      {
        name: "wrong entity ID",
        questionId: "VFCGVYPVtLzCtt4teeoW4",
      },
      {
        name: "one too many entity ID character",
        questionId: "VFCGVYPVtLzCtt4teeoW49",
      },
      {
        name: "wrong number ID",
        questionId: 9999,
      },
    ];

    successTestCases.forEach(({ name, questionIdAlias }) => {
      it(`should load question content for ${name}`, () => {
        cy.get(questionIdAlias).then((questionId) => {
          mountInteractiveQuestion({ questionId });
        });

        getSdkRoot().within(() => {
          cy.findByText("Product ID").should("be.visible");
          cy.findByText("Max of Quantity").should("be.visible");
        });
      });
    });

    failureTestCases.forEach(({ name, questionId }) => {
      it(`should show an error message for ${name}`, () => {
        mountInteractiveQuestion(
          { questionId },
          { shouldAssertCardQuery: false },
        );

        getSdkRoot().within(() => {
          const expectedErrorMessage = `Question ${questionId} not found. Make sure you pass the correct ID.`;
          cy.findByRole("alert").should("have.text", expectedErrorMessage);
          cy.findByText("Product ID").should("not.exist");
          cy.findByText("Max of Quantity").should("not.exist");
        });
      });
    });
  });

  it("should select sensible display for new questions (EMB-308)", () => {
    mountSdkContent(<InteractiveQuestion questionId="new" />);
    cy.log("Select data");
    H.popover().findByRole("link", { name: "Orders" }).click();

    cy.log("Select summarization");
    H.getNotebookStep("summarize")
      .findByText("Pick a function or metric")
      .click();
    H.popover().findByRole("option", { name: "Count of rows" }).click();

    cy.log("Select grouping");
    H.getNotebookStep("summarize")
      .findByText("Pick a column to group by")
      .click();
    H.popover().findByRole("heading", { name: "Created At" }).click();

    cy.log("Set limit");
    const LIMIT = 2;
    cy.button("Row limit").click();
    cy.findByPlaceholderText("Enter a limit")
      .type(LIMIT.toString())
      .realPress("Tab");

    cy.log("Visualize");
    H.visualize();
    H.cartesianChartCircle().should("have.length", LIMIT);
  });

  it("can change target collection to a different entity id without crashing (metabase#57438)", () => {
    const TestComponent = () => {
      const [targetCollection, setTargetCollection] = useState<string | null>(
        FIRST_COLLECTION_ENTITY_ID!,
      );

      return (
        <div>
          <div>id = {targetCollection}</div>

          <InteractiveQuestion
            questionId="new"
            targetCollection={targetCollection}
            onSave={() => {}}
            isSaveEnabled
          />

          <div
            onClick={() => setTargetCollection(SECOND_COLLECTION_ENTITY_ID!)}
          >
            use second collection
          </div>
        </div>
      );
    };

    mountSdkContent(<TestComponent />);

    getSdkRoot().within(() => {
      cy.findByText(`id = ${FIRST_COLLECTION_ENTITY_ID}`).should("exist");

      cy.log("click on the button to switch target collection");
      cy.findByText("use second collection").click();
      cy.findByText(`id = ${SECOND_COLLECTION_ENTITY_ID}`).should("exist");
    });

    cy.log("close any existing open popovers to reduce flakes");
    cy.get("body").type("{esc}");

    getSdkRoot().within(() => {
      cy.log("open the data picker");
      cy.findByText("Pick your starting data").click();

      cy.log("ensure that the interactive question still works");
      H.popover().findByRole("link", { name: "Orders" }).click();
      cy.findByRole("button", { name: "Visualize" }).should("be.visible");
    });
  });

  it("should not show any sdk error when showing a question in strict mode", () => {
    cy.get<string>("@questionId").then((questionId) => {
      mountSdkContent(<InteractiveQuestion questionId={questionId} />, {
        strictMode: true,
      });

      getSdkRoot().within(() => {
        H.assertElementNeverExists({
          shouldNotExistSelector: "[data-testid='sdk-error-container']",
          successSelector: "[data-testid='table-header']",
          rejectionMessage:
            "sdk errors should not show up when rendering an interactive question in strict mode",
          pollInterval: 20,
          timeout: 15000,
        });

        cy.log("should show the question's visualization");
        cy.findByText("Product ID").should("be.visible");
        cy.findByText("Max of Quantity").should("be.visible");
      });
    });
  });

  it("should show the editor when switching from existing question to new question (metabase#60075)", () => {
    const TestComponent = ({
      initialQuestionId,
    }: {
      initialQuestionId: string | number;
    }) => {
      const [questionId, setQuestionId] = useState<string | number>(
        initialQuestionId,
      );

      return (
        <Box>
          <InteractiveQuestion questionId={questionId} />
          <Button onClick={() => setQuestionId("new")}>New Question</Button>
        </Box>
      );
    };

    cy.get<number>("@questionId").then((questionId) => {
      mountSdkContent(<TestComponent initialQuestionId={questionId} />);

      cy.log("shows an existing question initially");
      getSdkRoot().within(() => {
        cy.findByText("Product ID").should("be.visible");
        cy.findByText("Max of Quantity").should("be.visible");
      });

      cy.log("switch to questionId=new");
      cy.findByText("New Question").click();

      getSdkRoot().within(() => {
        cy.log("should show the query builder");
        cy.findByText("Pick your starting data").should("be.visible");

        cy.log("should not show an empty visualization state (metabase#60075)");
        cy.findByText(/To run your code, click on the Run button/).should(
          "not.exist",
        );
      });
    });
  });

  it("should not show 'Back to previous results' button when filtering returns no results on a new question (EMB-620)", () => {
    mountSdkContent(<InteractiveQuestion questionId="new" />);
    H.popover().findByRole("link", { name: "Orders" }).click();

    getSdkRoot().within(() => {
      cy.findByText("Visualize").click();

      cy.log("add a filter that returns no results");
      cy.findByText("Filter").click();

      H.popover().within(() => {
        cy.findByText("ID").click();
        cy.findByPlaceholderText("Enter an ID").type("555555");
        cy.findByText("Add filter").click();
      });

      cy.log("back to previous result button should not be visible");
      cy.findByText("No results!").should("be.visible");
      cy.findByText("Back to previous results").should("not.exist");
    });
  });

  it("should show the `Save` button when a visualization type was changed (metabase#62396)", () => {
    mountSdkContent(<InteractiveQuestion questionId={ORDERS_QUESTION_ID} />);

    getSdkRoot().within(() => {
      cy.findByTestId("chart-type-selector-button").click();

      cy.findByTestId("sdk-question-save-button").should("not.exist");

      cy.findByRole("menu").within(() => {
        cy.findByText("Trend").click();
      });

      cy.findByTestId("interactive-question-top-toolbar").within(() => {
        cy.findByText("Save").should("exist");
      });
    });
  });

  it("should show the `Save` button when a visualization setting was changed (metabase#62396)", () => {
    mountSdkContent(<InteractiveQuestion questionId={ORDERS_QUESTION_ID} />);

    getSdkRoot().within(() => {
      H.openVizSettingsSidebar();

      cy.findByTestId("sdk-question-save-button").should("not.exist");

      cy.findByTestId("chartsettings-sidebar").within(() => {
        cy.findByTestId("User ID-hide-button").click();
      });

      cy.findByTestId("interactive-question-top-toolbar").within(() => {
        cy.findByText("Save").should("exist");
      });
    });
  });

  it("downloads should work when using entity IDs", () => {
    cy.intercept("POST", "/api/card/*/query/xlsx").as("questionDownload");

    cy.get<string>("@questionEntityId").then((questionEntityId) => {
      mountSdkContent(
        <InteractiveQuestion questionId={questionEntityId} withDownloads />,
      );
    });

    getSdkRoot().within(() => {
      cy.findByTestId("interactive-question-result-toolbar")
        .findByTestId("question-download-widget-button")
        .click();

      cy.findByText(".xlsx").click();
      cy.findByTestId("download-results-button").click();
    });

    cy.wait("@questionDownload").then((interception) => {
      expect(interception.response?.statusCode).to.equal(200);
    });
  });

  it("should stay in editor mode after adding a filter for the first time for an existing saved question (EMB-1077)", () => {
    cy.get<string>("@questionId").then((questionId) => {
      mountSdkContent(<InteractiveQuestion questionId={questionId} />);
    });

    getSdkRoot().within(() => {
      cy.findByTestId("notebook-button").click();

      cy.findByRole("button", { name: "Visualize" }).should("exist");

      cy.findByTestId("step-data-0-0").within(() => {
        cy.findAllByTestId("action-buttons").find(".Icon-filter").click();
      });
    });

    H.popover().within(() => {
      cy.findByText("Created At").click();
      cy.findByText("Previous 7 days").click();
    });

    getSdkRoot().within(() => {
      cy.findByRole("button", { name: "Visualize" }).should("exist");
    });
  });

  it("should close the editor after modifying and saving an existing question in-place", () => {
    cy.get<number>("@questionId").then((questionId) => {
      mountSdkContent(
        <InteractiveQuestion questionId={questionId} isSaveEnabled />,
      );
    });

    getSdkRoot().within(() => {
      cy.findByTestId("visualization-root").should("be.visible");
      cy.findByTestId("notebook-button").click();

      cy.findByTestId("step-data-0-0").within(() => {
        cy.findAllByTestId("action-buttons").find(".Icon-filter").click();
      });
    });

    H.popover().findByText("Product ID").click();
    H.popover().within(() => {
      cy.findByPlaceholderText("Enter an ID").type("1");
      cy.findByText("Add filter").click();
    });

    getSdkRoot().within(() => {
      cy.findByText("Back to visualization").should("be.visible");
      cy.findByRole("button", { name: "Save" }).click();
    });

    H.modal().within(() => {
      cy.findByText(/Replace original question/).click();
      cy.findByRole("button", { name: "Save" }).click();
    });

    getSdkRoot().within(() => {
      cy.findByText("Back to visualization").should("not.exist");
      cy.findByTestId("visualization-root").should("be.visible");
    });
  });

  it("should close the editor after modifying and saving an existing question as a new question", () => {
    cy.get<number>("@questionId").then((questionId) => {
      mountSdkContent(
        <InteractiveQuestion questionId={questionId} isSaveEnabled />,
      );
    });

    getSdkRoot().within(() => {
      cy.findByTestId("visualization-root").should("be.visible");
      cy.findByTestId("notebook-button").click();

      cy.findByTestId("step-data-0-0").within(() => {
        cy.findAllByTestId("action-buttons").find(".Icon-filter").click();
      });
    });

    H.popover().findByText("Product ID").click();
    H.popover().within(() => {
      cy.findByPlaceholderText("Enter an ID").type("1");
      cy.findByText("Add filter").click();
    });

    getSdkRoot().within(() => {
      cy.findByText("Back to visualization").should("be.visible");
      cy.findByRole("button", { name: "Save" }).click();
    });

    H.modal().within(() => {
      cy.findByText("Save as new question").click();
      cy.findByPlaceholderText("What is the name of your question?")
        .clear()
        .type("Orders Copy");
      cy.findByRole("button", { name: "Save" }).click();
    });

    getSdkRoot().within(() => {
      cy.findByText("Back to visualization").should("not.exist");
      cy.findByTestId("visualization-root").should("be.visible");
    });
  });
});
