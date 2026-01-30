import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { H } = cy;

// Helper functions
const isMac = Cypress.platform === "darwin";
const metaKey = isMac ? "Meta" : "Control";

const { ORDERS_ID, PEOPLE_ID } = SAMPLE_DATABASE;

const toggleInlineSQLPrompt = () => {
  H.NativeEditor.get().focus();
  cy.wait(250);
  H.NativeEditor.get().realPress([metaKey, "Shift", "I"]);
};

const inlinePrompt = () => cy.findByTestId("metabot-inline-sql-prompt");
const inlinePromptInput = () =>
  inlinePrompt().find(".ProseMirror[contenteditable=true]");
const generateButton = () => cy.findByTestId("metabot-inline-sql-generate");
const cancelButton = () => cy.findByTestId("metabot-inline-sql-cancel");
const errorMessage = () => cy.findByTestId("metabot-inline-sql-error");
const acceptButton = () => cy.findByTestId("accept-proposed-changes-button");
const rejectButton = () => cy.findByTestId("reject-proposed-changes-button");
const generatingLoader = () => cy.findByTestId("metabot-inline-sql-generating");

// Table bar helpers
const tableBar = () => cy.findByTestId("metabot-table-input");
const tableBarInput = () => tableBar().find("input");
const tablePill = (name: string) => tableBar().contains(name);

describe("Native SQL generation", () => {
  describe("OSS", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
    });

    it("should not be available in OSS", () => {
      H.startNewNativeQuestion();
      H.NativeEditor.get().should("be.visible");
      toggleInlineSQLPrompt();
      inlinePrompt().should("not.exist");
    });

    it("should show table bar and support full generation workflow", () => {
      cy.request("PUT", "/api/setting/llm-anthropic-api-key", {
        value: "sk-ant-api03-test-token",
      });

      const finalSQL =
        "SELECT o.*, p.*\nFROM public.orders o\nJOIN public.people p ON o.user_id = p.id";
      cy.intercept("POST", "/api/llm/generate-sql", {
        statusCode: 200,
        delay: 100,
        body: {
          sql: finalSQL,
          referenced_entities: [
            {
              id: ORDERS_ID,
              model: "table",
              name: "ORDERS",
              display_name: "Orders",
            },
            {
              id: PEOPLE_ID,
              model: "table",
              name: "PEOPLE",
              display_name: "People",
            },
          ],
        },
      }).as("generateSql");

      cy.log("feature is available when LLM is configured");
      H.startNewNativeQuestion({ query: "SELECT * FROM ORDERS" });
      H.NativeEditor.get().should("be.visible");
      toggleInlineSQLPrompt();
      inlinePrompt().should("be.visible");
      generateButton().should("be.disabled");
      tableBar().should("be.visible");

      cy.log("extract-tables populates table pills from existing query");
      tablePill("Orders").should("be.visible");

      cy.log("typing in table bar input renders search results");
      tableBarInput().click();
      cy.realType("people", { pressDelay: 10 });
      cy.findByRole("option", { name: /People/i }).should("be.visible");

      cy.log("selecting People from dropdown adds it to the list");
      cy.findByRole("option", { name: /People/i }).click();
      tablePill("People").should("be.visible");
      tablePill("Orders").should("be.visible");

      cy.log("selecting Reviews from dropdown adds it to the list");
      tableBarInput().click();
      cy.realType("reviews", { pressDelay: 10 });
      cy.findByRole("option", { name: /Reviews/i }).should("be.visible");
      cy.findByRole("option", { name: /Reviews/i }).click();
      tablePill("Reviews").should("be.visible");
      tablePill("People").should("be.visible");
      tablePill("Orders").should("be.visible");

      cy.log("can remove table pill by clicking and pressing backspace");
      tablePill("Reviews").click();
      cy.realPress("Backspace");
      tablePill("Reviews").should("not.exist");
      tablePill("People").should("be.visible");
      tablePill("Orders").should("be.visible");

      cy.log("generate button enables after typing prompt");
      inlinePromptInput().click();
      cy.realType("show me orders", { pressDelay: 10 });
      generateButton().should("be.enabled");

      cy.log("clicking generate shows loading state and sends correct request");
      generateButton().click();
      generatingLoader().should("exist");

      cy.wait("@generateSql").then(({ request }) => {
        expect(request.body.prompt).to.eq("show me orders");
        expect(request.body.database_id).to.eq(1);
        expect(request.body.referenced_entities).to.have.length(2);
        const tableIds = request.body.referenced_entities.map(
          (e: { id: number }) => e.id,
        );
        expect(tableIds).to.include(ORDERS_ID);
        expect(tableIds).to.include(PEOPLE_ID);
      });

      cy.log("generation completes and shows accept/reject buttons");
      inlinePrompt().should("not.exist");
      acceptButton().should("be.visible");
      rejectButton().should("be.visible");
      H.NativeEditor.get().should("contain", "SELECT * FROM ORDERS");

      cy.log("accepting changes updates the editor");
      acceptButton().click();
      acceptButton().should("not.exist");
      rejectButton().should("not.exist");
      finalSQL.split("\n").forEach((part) => {
        H.NativeEditor.get().should("contain", part);
      });

      cy.log("manually editing query to add reviews extracts reviews table");
      H.NativeEditor.get().click();
      H.NativeEditor.get().realPress([metaKey, "a"]);
      H.NativeEditor.get().realPress("Backspace");
      H.NativeEditor.type(
        "SELECT * FROM ORDERS JOIN REVIEWS ON ORDERS.PRODUCT_ID = REVIEWS.PRODUCT_ID",
        { delay: 10 },
      );
      toggleInlineSQLPrompt();
      tablePill("Orders").should("be.visible");
      tablePill("Reviews").should("be.visible");
    });
  });

  describe("ee", () => {
    describe("single db", () => {
      beforeEach(() => {
        H.restore();
        cy.signInAsAdmin();
        H.activateToken("bleeding-edge");
        cy.intercept("POST", "/api/ee/metabot-v3/agent-streaming").as(
          "agentReq",
        );
      });

      it("should be able to successfully generate sql", () => {
        cy.intercept("POST", "/api/llm/extract-tables").as("extractTables");

        H.startNewNativeQuestion({ query: "SELECT 1" });
        H.NativeEditor.get().should("be.visible");

        toggleInlineSQLPrompt();
        inlinePrompt().should("be.visible");
        generateButton().should("be.disabled");

        cy.log("table bar should not be shown for EE");
        tableBar().should("not.exist");

        inlinePromptInput().click();
        cy.realType("select all users", { pressDelay: 10 });
        generateButton().should("be.enabled");

        H.mockMetabotResponse({
          body: mockCodeEditResponse("SELECT * FROM users"),
          delay: 100,
        });
        generateButton().click();
        generatingLoader().should("exist");
        cy.wait("@metabotAgent").then(({ request }) => {
          const codeEditor = request.body.context.user_is_viewing.find(
            (ctx: { type: string }) => ctx.type === "code_editor",
          );
          expect(codeEditor).to.exist;
          expect(codeEditor.buffers).to.have.length(1);
          expect(codeEditor.buffers[0].source.language).to.eq("sql");
          expect(codeEditor.buffers[0].source.database_id).to.eq(1); // Sample Database
        });

        // should auto-close input and show diff with accept/reject buttons
        inlinePrompt().should("not.exist");
        acceptButton().should("be.visible");
        rejectButton().should("be.visible");
        H.NativeEditor.get().should("contain", "SELECT 1");
        H.NativeEditor.get().should("contain", "SELECT * FROM users");

        // should be able to accept changes
        acceptButton().click();
        acceptButton().should("not.exist");
        rejectButton().should("not.exist");
        H.NativeEditor.get().should("not.contain", "SELECT 1");
        H.NativeEditor.get().should("contain", "SELECT * FROM users");

        cy.log("extract-tables should not be called for EE");
        cy.get("@extractTables.all").should("have.length", 0);
      });

      it("should be able to correctly control the input", () => {
        H.startNewNativeQuestion();
        H.NativeEditor.get().should("be.visible");

        // open / close the editor via key press
        inlinePrompt().should("not.exist");
        toggleInlineSQLPrompt();
        inlinePrompt().should("be.visible");
        toggleInlineSQLPrompt();
        inlinePrompt().should("not.exist");

        // cancel button should close
        toggleInlineSQLPrompt();
        inlinePrompt().should("be.visible");
        cancelButton().click();
        inlinePrompt().should("not.exist");

        // cancel button should cancel inflight request
        toggleInlineSQLPrompt();
        inlinePromptInput().click();
        cy.realType("select all users", { pressDelay: 10 });
        H.mockMetabotResponse({
          body: mockCodeEditResponse("SELECT * FROM users"),
          delay: 1000,
        });
        generateButton().click();
        generatingLoader().should("exist");
        cancelButton().click();
        cy.get("@metabotAgent").its("state").should("eq", "Errored");
        inlinePrompt().should("not.exist");
        acceptButton().should("not.exist");
      });
    });

    describe("multi-db", () => {
      beforeEach(() => {
        H.restore("postgres-12");
        cy.signInAsAdmin();
        H.activateToken("bleeding-edge");
        cy.intercept("POST", "/api/ee/metabot-v3/agent-streaming").as(
          "agentReq",
        );
      });

      it("should manage conversation state correctly", () => {
        H.startNewNativeQuestion({ query: "SELECT 1" });
        H.NativeEditor.get().should("be.visible");

        // open input, send a prompt, get suggestion back
        toggleInlineSQLPrompt();
        inlinePromptInput().click();
        cy.realType("select all users", { pressDelay: 10 });
        H.mockMetabotResponse({
          body: mockCodeEditResponse("SELECT * FROM users"),
        });
        generateButton().click();
        cy.wait("@metabotAgent");
        acceptButton().should("be.visible");

        // reject the change and open input again
        rejectButton().click();
        acceptButton().should("not.exist");
        H.NativeEditor.get().should("contain", "SELECT 1");
        H.NativeEditor.get().should("not.contain", "SELECT * FROM users");
        H.NativeEditor.focus();
        toggleInlineSQLPrompt();
        inlinePrompt().should("be.visible");

        // send another message, history should contain rejection info
        inlinePromptInput().click();
        cy.realType("try again", { pressDelay: 10 });
        H.mockMetabotResponse({
          body: mockCodeEditResponse("SELECT id FROM users"),
        });
        generateButton().click();
        cy.wait("@metabotAgent").then(({ request }) => {
          expect(request.body.history).to.have.length.greaterThan(0);
          expect(request.body.message).to.include(
            "User rejected the following suggestion:\n\nSELECT * FROM users",
          );
        });
        acceptButton().should("be.visible");

        // change the selected database, should close the input
        rejectButton().click();
        toggleInlineSQLPrompt();
        inlinePrompt().should("be.visible");
        H.NativeEditor.selectDataSource("QA Postgres12");
        inlinePrompt().should("not.exist");

        // open again, send a prompt, req.body.history should be empty
        toggleInlineSQLPrompt();
        inlinePromptInput().click();
        cy.realType("select something", { pressDelay: 10 });
        H.mockMetabotResponse({
          body: mockCodeEditResponse("SELECT 123"),
        });
        generateButton().click();
        cy.wait("@metabotAgent").then(({ request }) => {
          expect(request.body.history).to.have.length(0);
        });

        // should get a valid response back
        acceptButton().should("be.visible");
        H.NativeEditor.get().should("contain", "SELECT 123");

        // leave the page, go to new SQL page and send a new prompt
        acceptButton().click();
        cy.visit("/");
        H.startNewNativeQuestion();
        H.NativeEditor.get().should("be.visible");
        toggleInlineSQLPrompt();
        inlinePromptInput().click();
        cy.realType("new prompt", { pressDelay: 10 });
        H.mockMetabotResponse({
          body: mockCodeEditResponse("SELECT 456"),
        });
        generateButton().click();
        cy.wait("@metabotAgent").then(({ request }) => {
          expect(request.body.history).to.have.length(0);
        });
        acceptButton().should("be.visible");

        // manually editing the editor should dismiss suggestion buttons
        H.NativeEditor.get().click();
        H.NativeEditor.get().realPress([metaKey, "a"]);
        H.NativeEditor.get().realPress("Backspace");
        acceptButton().should("not.exist");
        rejectButton().should("not.exist");
      });

      it("should show error if no code_edit is received", () => {
        H.startNewNativeQuestion();
        H.NativeEditor.get().should("be.visible");

        toggleInlineSQLPrompt();
        inlinePromptInput().click();
        cy.realType("do something", { pressDelay: 10 });
        H.mockMetabotResponse({
          body: mockTextOnlyResponse("I can help with that!"),
        });
        generateButton().click();
        cy.wait("@metabotAgent");

        errorMessage().should("be.visible");
        acceptButton().should("not.exist");
      });
    });
  });
});

// Response helpers
const mockCodeEditResponse = (sql: string) =>
  `2:{"type":"code_edit","version":1,"value":{"buffer_id":"qb","mode":"rewrite","value":"${sql}"}}
d:{"finishReason":"stop","usage":{"promptTokens":100,"completionTokens":10}}`;

const mockTextOnlyResponse = (text: string) =>
  `0:"${text}"
d:{"finishReason":"stop","usage":{"promptTokens":100,"completionTokens":10}}`;
