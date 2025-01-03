import { InteractiveQuestion } from "@metabase/embedding-sdk-react";
import type { ComponentProps } from "react";

import { mountSdkContent } from "./component-embedding-sdk-helpers";

export function mountInteractiveQuestion(
  extraProps: Partial<ComponentProps<typeof InteractiveQuestion>> = {},
) {
  cy.intercept("GET", "/api/card/*").as("getCard");
  cy.intercept("POST", "/api/card/*/query").as("cardQuery");

  cy.get<number>("@questionId").then(questionId => {
    mountSdkContent(
      <InteractiveQuestion questionId={questionId} {...extraProps} />,
    );
  });

  cy.wait("@getCard").then(({ response }) => {
    expect(response?.statusCode).to.equal(200);
  });
}
