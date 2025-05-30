import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  METABASE_INSTANCE_URL,
  createQuestion,
  mapPinIcon,
} from "e2e/support/helpers";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import { mountInteractiveQuestion } from "e2e/support/helpers/embedding-sdk-component-testing";
import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/embedding-sdk-testing";
import { mockAuthProviderAndJwtSignIn } from "e2e/support/helpers/embedding-sdk-testing/embedding-sdk-helpers";

const { PEOPLE_ID } = SAMPLE_DATABASE;

describe("scenarios > embedding-sdk > interactive-question-map", () => {
  beforeEach(() => {
    signInAsAdminAndEnableEmbeddingSdk();

    createQuestion({
      name: "13597",
      display: "map",
      query: {
        "source-table": PEOPLE_ID,
        limit: 2,
      },
    }).then(({ body: question }) => {
      cy.wrap(question.id).as("questionId");
      cy.wrap(question.entity_id).as("questionEntityId");
    });

    cy.signOut();

    mockAuthProviderAndJwtSignIn();
  });

  it("should show pin icon", () => {
    mountInteractiveQuestion();

    getSdkRoot().within(() => {
      mapPinIcon()
        .should("be.visible")
        .should("have.attr", "src")
        .and("include", METABASE_INSTANCE_URL);
    });
  });
});
