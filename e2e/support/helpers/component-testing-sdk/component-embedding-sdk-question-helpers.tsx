import {
  InteractiveQuestion,
  StaticQuestion,
} from "@metabase/embedding-sdk-react";
import type { ComponentProps } from "react";

import {
  type MountSdkOptions,
  mountSdkContent,
} from "./component-embedding-sdk-helpers";

interface MountQuestionOptions extends MountSdkOptions {
  shouldAssertCardQuery?: boolean;
}

export function mountInteractiveQuestion(
  extraProps: Partial<ComponentProps<typeof InteractiveQuestion>> = {},
  { shouldAssertCardQuery, ...mountSdkContentOptions }: MountQuestionOptions = {
    shouldAssertCardQuery: true,
  },
) {
  cy.intercept("GET", "/api/card/*").as("getCard");
  cy.intercept("POST", "/api/card/*/query").as("cardQuery");

  cy.get<number>("@questionId").then(questionId => {
    mountSdkContent(
      <InteractiveQuestion questionId={questionId} {...extraProps} />,
      mountSdkContentOptions,
    );
  });

  if (shouldAssertCardQuery) {
    cy.wait("@getCard").then(({ response }) => {
      expect(response?.statusCode).to.equal(200);
    });
  }
}

export function mountStaticQuestion(
  extraProps: Partial<ComponentProps<typeof StaticQuestion>> = {},
  { shouldAssertCardQuery }: MountQuestionOptions = {
    shouldAssertCardQuery: true,
  },
) {
  cy.intercept("GET", "/api/card/*").as("getCard");
  cy.intercept("POST", "/api/card/*/query").as("cardQuery");

  cy.get<number>("@questionId").then(questionId => {
    mountSdkContent(<StaticQuestion questionId={questionId} {...extraProps} />);
  });

  if (shouldAssertCardQuery) {
    cy.wait("@getCard").then(({ response }) => {
      expect(response?.statusCode).to.equal(200);
    });
  }
}
