const { H } = cy;

// Helper functions
const isMac = Cypress.platform === "darwin";
const metaKey = isMac ? "Meta" : "Control";

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

describe("Native SQL generation", () => {
  describe("OSS", { tags: "@OSS" }, () => {
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
  });

  describe("oss llm", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
    });

    it("should show the feature when LLM SQL generation is enabled and send request to generate-sql endpoint", () => {
      // Intercept settings API to enable the LLM SQL generation feature
      cy.intercept("GET", "/api/session/properties", (req) => {
        req.continue((res) => {
          res.body["llm-sql-generation-enabled"] = true;
        });
      }).as("sessionProperties");

      // Intercept the OSS endpoint (not streaming - simple JSON response)
      cy.intercept("POST", "/api/llm/generate-sql", {
        statusCode: 200,
        delay: 100,
        body: {
          parts: [
            {
              type: "code_edit",
              version: 1,
              value: {
                buffer_id: "qb",
                mode: "rewrite",
                value: "SELECT * FROM users",
              },
            },
          ],
        },
      }).as("generateSql");

      H.startNewNativeQuestion();
      H.NativeEditor.get().should("be.visible");

      // Feature should now be available
      toggleInlineSQLPrompt();
      inlinePrompt().should("be.visible");
      generateButton().should("be.disabled");

      // Type prompt and generate
      inlinePromptInput().type("select all users");
      generateButton().should("be.enabled");
      generateButton().click();
      generateButton().should("contain", "Generating...");

      // Verify request was sent to OSS endpoint with correct payload
      cy.wait("@generateSql").then(({ request }) => {
        expect(request.body.prompt).to.eq("select all users");
        expect(request.body.database_id).to.eq(1); // Sample Database
      });

      // Should auto-close input and show diff with accept/reject buttons
      inlinePrompt().should("not.exist");
      acceptButton().should("be.visible");
      rejectButton().should("be.visible");
      H.NativeEditor.get().should("contain", "SELECT * FROM users");

      // Accept changes
      acceptButton().click();
      acceptButton().should("not.exist");
      rejectButton().should("not.exist");
      H.NativeEditor.get().should("contain", "SELECT * FROM users");
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
        H.startNewNativeQuestion({ query: "SELECT 1" });
        H.NativeEditor.get().should("be.visible");

        toggleInlineSQLPrompt();
        inlinePrompt().should("be.visible");
        generateButton().should("be.disabled");

        inlinePromptInput().type("select all users");
        generateButton().should("be.enabled");

        H.mockMetabotResponse({
          body: mockCodeEditResponse("SELECT * FROM users"),
          delay: 100,
        });
        generateButton().click();
        generateButton().should("contain", "Generating...");
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
        inlinePromptInput().type("select all users");
        H.mockMetabotResponse({
          body: mockCodeEditResponse("SELECT * FROM users"),
          delay: 1000,
        });
        generateButton().click();
        generateButton().should("contain", "Generating...");
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
        inlinePromptInput().type("select all users");
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
        inlinePromptInput().type("try again");
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
        inlinePromptInput().type("select something");
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
        inlinePromptInput().type("new prompt");
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
        inlinePromptInput().type("do something");
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
