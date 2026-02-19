import { WRITABLE_DB_ID } from "e2e/support/cypress_data";

const { H } = cy;
const { Workspaces } = H;

const SOURCE_TABLE = "Animals";

// temporarily disabled, should be enabled in upcoming iteration
describe.skip("scenarios > data studio > workspaces > metabot", () => {
  beforeEach(() => {
    H.restore("postgres-writable");
    H.resetTestTable({ type: "postgres", table: "many_schemas" });
    H.resetSnowplow();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    H.resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: SOURCE_TABLE });

    cy.request("PUT", "/api/permissions/graph", {
      groups: {
        "1": {
          "1": { download: { schemas: "full" }, "view-data": "unrestricted" },
          "2": {
            "view-data": "unrestricted",
            download: { schemas: "full" },
            "create-queries": "query-builder-and-native",
          },
        },
      },
      revision: 1,
      sandboxes: [],
      impersonations: [],
    });

    cy.intercept("POST", "/api/ee/workspace").as("createWorkspace");
    cy.intercept("POST", "/api/ee/metabot-v3/agent-streaming").as("agentReq");
  });

  it("should be able to create a transform via metabot in workspace", () => {
    Workspaces.visitWorkspaces();

    cy.log("Create a new workspace");
    Workspaces.getNewWorkspaceButton().click();
    cy.wait("@createWorkspace");

    cy.log("Open the Agent Chat tab");
    cy.findByRole("tab", { name: "Agent Chat" }).click();

    cy.log("Verify metabot chat is visible");
    cy.findByTestId("metabot-chat").should("be.visible");

    cy.log("Send a message to metabot asking to create a transform");
    H.mockMetabotResponse({
      body: createMockTransformSuggestionResponse(
        "I'll create a SQL transform that selects all animals for you.",
        createMockNativeTransformJSON(
          null,
          WRITABLE_DB_ID,
          'SELECT * FROM "Schema A"."Animals"',
        ),
      ),
    });
    H.sendMetabotMessage("Create a SQL transform that selects all animals");

    cy.log("Verify the suggestion appears in the chat");
    cy.findByTestId("metabot-chat-suggestion").should("be.visible");
    cy.findByTestId("metabot-chat-suggestion").should(
      "contain",
      'SELECT * FROM "Schema A"."Animals"',
    );

    cy.log("Apply the suggestion to create the transform");
    cy.findByTestId("metabot-chat-suggestion")
      .findByRole("button", { name: /create/i })
      .click();

    cy.log("Verify transform tab is opened with the suggested code");
    Workspaces.getWorkspaceContent().within(() => {
      H.tabsShouldBe("New transform", [
        "Setup",
        "Agent Chat",
        "Graph",
        "New transform",
      ]);
    });
    H.NativeEditor.get().should("contain", "SELECT * FROM");

    cy.log("Verify the transform appears in the workspace transforms list");
    Workspaces.getWorkspaceTransforms()
      .findByText("New transform")
      .should("be.visible");

    cy.log("Accept the suggested transform");
    cy.findByTestId("accept-proposed-changes-button").click();

    cy.log("Run preview to verify the transform works");
    cy.findByTestId("run-button").click();

    cy.log("Verify preview tab opens with results");
    Workspaces.getWorkspaceContent().within(() => {
      H.tabsShouldBe("Preview (New transform)", [
        "Setup",
        "Agent Chat",
        "Graph",
        "New transform",
        "Preview (New transform)",
      ]);
    });
    H.assertTableData({
      columns: ["name", "score"],
      firstRows: [
        ["Duck", "10"],
        ["Horse", "20"],
        ["Cow", "30"],
      ],
    });

    cy.log("Save the transform with a name and target table");
    cy.findByRole("tab", { name: "New transform" }).click();
    Workspaces.getSaveTransformButton().click();

    const transformName = "My transform";
    H.modal().within(() => {
      cy.findByLabelText(/Name/).clear().type(transformName);
      cy.findByLabelText(/Table name/)
        .clear()
        .type("animals_transform");
      cy.findByLabelText("Schema").click();
      cy.document()
        .findByRole("option", { name: /Schema A/ })
        .click();
      cy.findByRole("button", { name: /Save/ }).click();
    });
    verifyAndCloseToast("Transform saved successfully");

    cy.log("Verify the saved transform appears in workspace transforms list");
    Workspaces.getWorkspaceTransforms()
      .findByText(transformName)
      .should("be.visible");

    cy.log("Run the transform to materialize the output table");
    Workspaces.getRunTransformButton().click();
    Workspaces.getRunTransformButton().should("have.text", "Ran successfully");

    cy.log("Verify the target table appears in the Data tab");
    Workspaces.openDataTab();
    Workspaces.getWorkspaceSidebar()
      .findByText("Schema A.animals_transform")
      .should("be.visible");
  });

  it("should be able to reject a metabot suggestion and keep the editor empty", () => {
    Workspaces.visitWorkspaces();

    cy.log("Create a new workspace");
    Workspaces.getNewWorkspaceButton().click();
    cy.wait("@createWorkspace");

    cy.log("Open the Agent Chat tab");
    cy.findByRole("tab", { name: "Agent Chat" }).click();

    cy.log("Verify metabot chat is visible");
    cy.findByTestId("metabot-chat").should("be.visible");

    cy.log("Send a message to metabot asking to create a transform");
    H.mockMetabotResponse({
      body: createMockTransformSuggestionResponse(
        "I'll create a SQL transform that selects all animals for you.",
        createMockNativeTransformJSON(
          null,
          WRITABLE_DB_ID,
          'SELECT * FROM "Schema A"."Animals"',
        ),
      ),
    });
    H.sendMetabotMessage("Create a SQL transform that selects all animals");

    cy.log("Verify the suggestion appears in the chat");
    cy.findByTestId("metabot-chat-suggestion").should("be.visible");

    cy.log("Apply the suggestion to create the transform");
    cy.findByTestId("metabot-chat-suggestion")
      .findByRole("button", { name: /create/i })
      .click();

    cy.log("Verify transform tab is opened with the suggested code");
    Workspaces.getWorkspaceContent().within(() => {
      H.tabsShouldBe("New transform", [
        "Setup",
        "Agent Chat",
        "Graph",
        "New transform",
      ]);
    });
    H.NativeEditor.get().should("contain", "SELECT * FROM");

    cy.log("Reject the suggested transform");
    cy.findByTestId("reject-proposed-changes-button").click();

    cy.log("Verify the editor is now empty after rejection");
    H.NativeEditor.value().should("be.empty");

    cy.log("Verify accept/reject buttons are no longer visible");
    cy.findByTestId("accept-proposed-changes-button").should("not.exist");
    cy.findByTestId("reject-proposed-changes-button").should("not.exist");

    cy.log("Verify save button is disabled since editor is empty");
    Workspaces.getSaveTransformButton().should("be.disabled");

    cy.log("Verify the transform still appears in workspace list as unsaved");
    Workspaces.getWorkspaceTransforms()
      .findByText("New transform")
      .should("be.visible");
  });

  it(
    "should be able to create a Python transform via metabot in workspace",
    { tags: ["@python"] },
    () => {
      Workspaces.visitWorkspaces();

      cy.log("Create a new workspace");
      Workspaces.getNewWorkspaceButton().click();
      cy.wait("@createWorkspace");

      cy.log("Open the Agent Chat tab");
      cy.findByRole("tab", { name: "Agent Chat" }).click();

      cy.log("Verify metabot chat is visible");
      cy.findByTestId("metabot-chat").should("be.visible");

      cy.log("Send a message to metabot asking to create a Python transform");
      H.mockMetabotResponse({
        body: createMockTransformSuggestionResponse(
          "I'll create a Python transform that returns a simple DataFrame.",
          createMockPythonTransformJSON(
            null,
            WRITABLE_DB_ID,
            {},
            "import pandas as pd\\n\\ndef transform():\\n    return pd.DataFrame({'message': ['Hello from Python!']})",
          ),
        ),
      });
      H.sendMetabotMessage("Create a Python transform that returns a greeting");

      cy.log("Verify the suggestion appears in the chat");
      cy.findByTestId("metabot-chat-suggestion").should("be.visible");
      cy.findByTestId("metabot-chat-suggestion").should(
        "contain",
        "Hello from Python!",
      );

      cy.log("Apply the suggestion to create the transform");
      cy.findByTestId("metabot-chat-suggestion")
        .findByRole("button", { name: /create/i })
        .click();

      cy.log("Verify transform tab is opened with the suggested code");
      Workspaces.getWorkspaceContent().within(() => {
        H.tabsShouldBe("New transform", [
          "Setup",
          "Agent Chat",
          "Graph",
          "New transform",
        ]);
      });
      H.PythonEditor.get().should("contain", "Hello from Python!");

      cy.log("Verify the transform appears in the workspace transforms list");
      Workspaces.getWorkspaceTransforms()
        .findByText("New transform")
        .should("be.visible");

      cy.log("Accept the suggested transform");
      cy.findByTestId("accept-proposed-changes-button").click();

      cy.log("Run preview to verify the transform works");
      cy.findByTestId("run-button").click();

      cy.log("Verify preview tab opens with results");
      Workspaces.getWorkspaceContent().within(() => {
        H.tabsShouldBe("Preview (New transform)", [
          "Setup",
          "Agent Chat",
          "Graph",
          "New transform",
          "Preview (New transform)",
        ]);
      });
      H.assertTableData({
        columns: ["message"],
        firstRows: [["Hello from Python!"]],
      });

      cy.log("Save the transform with a name and target table");
      cy.findByRole("tab", { name: "New transform" }).click();
      Workspaces.getSaveTransformButton().click();

      const transformName = "My Python transform";
      H.modal().within(() => {
        cy.findByLabelText(/Name/).clear().type(transformName);
        cy.findByLabelText(/Table name/)
          .clear()
          .type("python_transform");
        cy.findByLabelText("Schema").click();
        cy.document()
          .findByRole("option", { name: /Schema A/ })
          .click();
        cy.findByRole("button", { name: /Save/ }).click();
      });
      verifyAndCloseToast("Transform saved successfully");

      cy.log("Verify the saved transform appears in workspace transforms list");
      Workspaces.getWorkspaceTransforms()
        .findByText(transformName)
        .should("be.visible");

      cy.log("Run the transform to materialize the output table");
      Workspaces.getRunTransformButton().click();
      Workspaces.getRunTransformButton().should(
        "have.text",
        "Ran successfully",
      );

      cy.log("Verify the target table appears in the Data tab");
      Workspaces.openDataTab();
      Workspaces.getWorkspaceSidebar()
        .findByText("Schema A.python_transform")
        .should("be.visible");
    },
  );

  it(
    "should be able to reject a Python metabot suggestion and keep the editor with default template",
    { tags: ["@python"] },
    () => {
      Workspaces.visitWorkspaces();

      cy.log("Create a new workspace");
      Workspaces.getNewWorkspaceButton().click();
      cy.wait("@createWorkspace");

      cy.log("Open the Agent Chat tab");
      cy.findByRole("tab", { name: "Agent Chat" }).click();

      cy.log("Verify metabot chat is visible");
      cy.findByTestId("metabot-chat").should("be.visible");

      cy.log("Send a message to metabot asking to create a Python transform");
      H.mockMetabotResponse({
        body: createMockTransformSuggestionResponse(
          "I'll create a Python transform that returns a simple DataFrame.",
          createMockPythonTransformJSON(
            null,
            WRITABLE_DB_ID,
            {},
            "import pandas as pd\\n\\ndef transform():\\n    return pd.DataFrame({'message': ['Hello from Python!']})",
          ),
        ),
      });
      H.sendMetabotMessage("Create a Python transform that returns a greeting");

      cy.log("Verify the suggestion appears in the chat");
      cy.findByTestId("metabot-chat-suggestion").should("be.visible");

      cy.log("Apply the suggestion to create the transform");
      cy.findByTestId("metabot-chat-suggestion")
        .findByRole("button", { name: /create/i })
        .click();

      cy.log("Verify transform tab is opened with the suggested code");
      Workspaces.getWorkspaceContent().within(() => {
        H.tabsShouldBe("New transform", [
          "Setup",
          "Agent Chat",
          "Graph",
          "New transform",
        ]);
      });
      H.PythonEditor.get().should("contain", "Hello from Python!");

      cy.log("Reject the suggested transform");
      cy.findByTestId("reject-proposed-changes-button").click();

      cy.log(
        "Verify the editor has default Python template after rejection (not the suggestion)",
      );
      H.PythonEditor.get().should("not.contain", "Hello from Python!");
      H.PythonEditor.get().should("contain", "Your transformation function");

      cy.log("Verify accept/reject buttons are no longer visible");
      cy.findByTestId("accept-proposed-changes-button").should("not.exist");
      cy.findByTestId("reject-proposed-changes-button").should("not.exist");

      cy.log("Verify the transform still appears in workspace list as unsaved");
      Workspaces.getWorkspaceTransforms()
        .findByText("New transform")
        .should("be.visible");
    },
  );
});

function createMockNativeTransformJSON(
  id: number | null,
  databaseId: number,
  sql: string,
) {
  const escapedSql = sql.replace(/"/g, '\\"');
  return `{"id":${id},"name":"New transform","entity_id":null,"description":"","source":{"type":"query","query":{"database":${databaseId},"type":"native","native":{"query":"${escapedSql}","template-tags":{}}}},"target":{"type":"table","name":""},"created_at":null,"updated_at":null}`;
}

function createMockPythonTransformJSON(
  id: number | null,
  databaseId: number,
  sourceTables: { [tableName: string]: number },
  body: string,
) {
  return `{"id":${id},"name":"New transform","entity_id":null,"description":"","source":{"type":"python","source-database":${databaseId},"source-tables":${JSON.stringify(sourceTables)},"body":"${body}"},"target":{"type":"table","name":""},"created_at":null,"updated_at":null}`;
}

function createMockTransformSuggestionResponse(
  text: string,
  transformJSON: string,
) {
  return `0:"${text}"
2:{"type":"transform_suggestion","version":1,"value":${transformJSON}}
2:{"type":"state","version":1,"value":{}}
d:{"finishReason":"stop","usage":{}}`;
}

function verifyAndCloseToast(message: string) {
  H.undoToast().should("contain.text", message);
  H.undoToast().icon("close").click();
}
