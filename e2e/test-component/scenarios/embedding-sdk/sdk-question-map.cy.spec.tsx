import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  createQuestion,
  getMetabaseInstanceUrl,
  mapPinIcon,
} from "e2e/support/helpers";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import { mountInteractiveQuestion } from "e2e/support/helpers/embedding-sdk-component-testing";
import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/embedding-sdk-testing";
import { mockAuthProviderAndJwtSignIn } from "e2e/support/helpers/embedding-sdk-testing/embedding-sdk-helpers";

const { PEOPLE_ID } = SAMPLE_DATABASE;

const setup = ({ pinType }: { pinType: "markers" | "tiles" }) => {
  signInAsAdminAndEnableEmbeddingSdk();

  createQuestion({
    name: "13597",
    display: "map",
    query: {
      "source-table": PEOPLE_ID,
      limit: 2,
    },
    visualization_settings: {
      "map.pin_type": pinType,
    },
  }).then(({ body: question }) => {
    cy.wrap(question.id).as("questionId");
    cy.wrap(question.entity_id).as("questionEntityId");
  });

  cy.signOut();

  mockAuthProviderAndJwtSignIn();
};

describe("scenarios > embedding-sdk > interactive-question-map", () => {
  it("should show pin icon from an instance", () => {
    setup({
      pinType: "markers",
    });

    mountInteractiveQuestion();

    getSdkRoot().within(() => {
      mapPinIcon()
        .should("be.visible")
        .should("have.attr", "src")
        .and("include", getMetabaseInstanceUrl());
    });
  });

  it("should load card tiles properly from an instance (#63638)", () => {
    setup({
      pinType: "tiles",
    });

    cy.intercept("/api/tiles/**").as("getTiles");

    mountInteractiveQuestion();

    cy.wait("@getTiles").then(
      ({ request: tilesRequest, response: tileResponse }) => {
        expect(tilesRequest.url).to.include(getMetabaseInstanceUrl());
        expect(tilesRequest.headers["x-metabase-session"]).to.not.eq(undefined);
        expect(tileResponse?.statusCode).to.equal(200);
      },
    );
  });
});
