import { InteractiveQuestion } from "@metabase/embedding-sdk-react";

import { mountSdkContent } from "e2e/support/helpers/component-embedding-sdk-helpers";

export function mountInteractiveQuestion() {
  cy.intercept("GET", "/api/card/*").as("getCard");
  cy.intercept("POST", "/api/card/*/query").as("cardQuery");

  cy.get<number>("@questionId").then(questionId => {
    mountSdkContent(<InteractiveQuestion questionId={questionId} />);
  });

  cy.wait("@getCard").then(({ response }) => {
    expect(response?.statusCode).to.equal(200);
  });
}
