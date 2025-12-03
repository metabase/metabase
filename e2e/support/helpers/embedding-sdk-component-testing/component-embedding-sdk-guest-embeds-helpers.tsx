import {
  type MetabaseProviderProps,
  StaticDashboard,
  StaticQuestion,
} from "@metabase/embedding-sdk-react";
import type { ComponentProps } from "react";

import type { DeepPartial } from "metabase/embedding-sdk/types/utils";

import { mountSdkContent } from "./component-embedding-sdk-helpers";

export function mountGuestEmbedQuestion(
  extraProps: Partial<ComponentProps<typeof StaticQuestion>> = {},
  {
    shouldAssertCardQuery,
    sdkProviderProps,
  }: {
    shouldAssertCardQuery?: boolean;
    sdkProviderProps?: DeepPartial<MetabaseProviderProps>;
  } = {
    shouldAssertCardQuery: true,
  },
) {
  cy.intercept("GET", "/api/embed/card/*").as("getCard");
  cy.intercept("POST", "/api/embed/card/*/query").as("cardQuery");
  cy.intercept("GET", "/api/embed/pivot/card/*/query*").as("getCardPivotQuery");

  mountSdkContent(<StaticQuestion {...extraProps} />, {
    sdkProviderProps: { authConfig: { isGuest: true }, ...sdkProviderProps },
  });

  if (shouldAssertCardQuery) {
    cy.wait("@getCard").then(({ response }) => {
      expect(response?.statusCode).to.equal(200);
    });
  }
}

export function mountGuestEmbedDashboard(
  extraProps: Partial<ComponentProps<typeof StaticDashboard>> = {},
) {
  cy.intercept("GET", "/api/embed/dashboard/*").as("getDashboard");

  mountSdkContent(<StaticDashboard {...extraProps} />, {
    sdkProviderProps: { authConfig: { isGuest: true } },
  });

  cy.wait("@getDashboard").then(({ response }) => {
    expect(response?.statusCode).to.equal(200);
  });
}
