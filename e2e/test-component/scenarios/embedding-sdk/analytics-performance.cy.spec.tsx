import { StaticQuestion } from "@metabase/embedding-sdk-react";

import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import { mountSdkContent } from "e2e/support/helpers/embedding-sdk-component-testing";
import {
  mockAuthProviderAndJwtSignIn,
  signInAsAdminAndEnableEmbeddingSdk,
} from "e2e/support/helpers/embedding-sdk-testing";

const { H } = cy;

const isNumber = (value: unknown) => typeof value === "number";
const isString = (value: unknown) => typeof value === "string";

describe("scenarios > embedding-sdk > analytics > performance", () => {
  beforeEach(() => {
    signInAsAdminAndEnableEmbeddingSdk();
    H.enableTracking();
    cy.signOut();
    mockAuthProviderAndJwtSignIn();
    H.resetMetaplow();
  });

  it("sends the performance event with the expected data", () => {
    mountSdkContent(<StaticQuestion questionId={ORDERS_QUESTION_ID} />);
    getSdkRoot().findByTestId("visualization-root").should("be.visible");

    H.expectMetaplowEvent({
      name: "embedding_sdk_first_component_performance",
      data: {
        result: "success",
        component: "StaticQuestion",
        client: "embedding-sdk-react",
        bundle_mode: "chunked", // tests `detectSdkBundleMode()`
        auth_method: "sso",
        sso_method: "jwt",
        jwt_provider_uri_passed: false,
        sdk_version: isString,
        bundle_load_start: isNumber,
        bundle_load_end: isNumber,
        init_start: isNumber,
        init_end: isNumber,
        first_component_provider_render: isNumber,
        first_component_render: isNumber,
        metadata_end: isNumber,
        query_start: isNumber,
        query_end: isNumber,
      },
    });
  });
});
