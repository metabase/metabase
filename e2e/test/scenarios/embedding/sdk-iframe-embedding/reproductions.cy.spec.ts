const { H } = cy;
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";

describe("issue 77135", () => {
  it("should add/remove columns via viz settings (EMB-2057)", () => {
    H.prepareSdkIframeEmbedTest({
      withToken: "bleeding-edge",
      signOut: false,
    });

    H.visitCustomHtmlPage(`
      ${H.getNewEmbedScriptTag()}
      ${H.getNewEmbedConfigurationScript({})}
      <metabase-question question-id="${ORDERS_QUESTION_ID}" />
    `);

    H.getSimpleEmbedIframeContent().within(() => {
      H.tableInteractive().findByText("Tax").should("be.visible");

      cy.findByTestId("viz-settings-button").click();
      cy.findByRole("button", { name: /Add or remove columns/ }).click();

      cy.findByLabelText("Tax").should("be.checked").click();

      H.tableInteractive().findByText("Tax").should("not.exist");
    });
  });
});
