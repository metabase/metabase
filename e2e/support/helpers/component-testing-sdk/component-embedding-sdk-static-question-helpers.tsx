import { StaticQuestion } from "@metabase/embedding-sdk-react";
import type { ComponentProps } from "react";

import { mountSdkContent } from "./component-embedding-sdk-helpers";

export function mountStaticQuestion(
  extraProps: Partial<ComponentProps<typeof StaticQuestion>> = {},
) {
  cy.intercept("GET", "/api/card/*").as("getCard");
  cy.intercept("POST", "/api/card/*/query").as("cardQuery");

  cy.get<number>("@questionId").then(questionId => {
    mountSdkContent(<StaticQuestion questionId={questionId} {...extraProps} />);
  });

  cy.wait("@getCard").then(({ response }) => {
    expect(response?.statusCode).to.equal(200);
  });
}
