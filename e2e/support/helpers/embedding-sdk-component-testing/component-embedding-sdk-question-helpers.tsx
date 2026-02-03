import {
  InteractiveQuestion,
  type InteractiveQuestionProps,
  type MetabaseProviderProps,
  StaticQuestion,
  type StaticQuestionProps,
} from "@metabase/embedding-sdk-react";

import {
  type MountSdkContentOptions,
  mountSdkContent,
} from "./component-embedding-sdk-helpers";

interface MountQuestionOptions extends MountSdkContentOptions {
  shouldAssertCardQuery?: boolean;
  sdkProviderProps?: Partial<MetabaseProviderProps>;
}

export function mountInteractiveQuestion(
  extraProps: Partial<InteractiveQuestionProps> = {},
  { shouldAssertCardQuery, ...mountSdkContentOptions }: MountQuestionOptions = {
    shouldAssertCardQuery: true,
  },
) {
  cy.intercept("GET", "/api/card/*").as("getCard");
  cy.intercept("POST", "/api/card/*/query").as("cardQuery");

  cy.get<number>("@questionId").then((questionId) => {
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
  extraProps: Partial<StaticQuestionProps> = {},
  { shouldAssertCardQuery, sdkProviderProps }: MountQuestionOptions = {
    shouldAssertCardQuery: true,
  },
) {
  cy.intercept("GET", "/api/card/*").as("getCard");
  cy.intercept("POST", "/api/card/*/query").as("cardQuery");

  cy.get<number>("@questionId").then((questionId) => {
    mountSdkContent(
      <StaticQuestion questionId={questionId} {...extraProps} />,
      { sdkProviderProps },
    );
  });

  if (shouldAssertCardQuery) {
    cy.wait("@getCard").then(({ response }) => {
      expect(response?.statusCode).to.equal(200);
    });
  }
}
