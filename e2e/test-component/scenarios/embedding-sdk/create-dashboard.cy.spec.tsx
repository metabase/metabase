import { CreateDashboardModal } from "@metabase/embedding-sdk-react";

const { H } = cy;
import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/component-testing-sdk";
import {
  mockAuthProviderAndJwtSignIn,
  mountSdkContent,
} from "e2e/support/helpers/component-testing-sdk/component-embedding-sdk-helpers";

describe("scenarios > embedding-sdk > create-dashboard modal", () => {
  describe("personal collection", () => {
    beforeEach(() => {
      signInAsAdminAndEnableEmbeddingSdk();
      cy.signOut();
      mockAuthProviderAndJwtSignIn();

      cy.intercept("POST", "/api/dashboard").as("createDashboard");

      // we need to make sure that "personal" is not used as a numeric id and therefore this endpoint is not called
      cy.intercept(
        "GET",
        "/api/collection/personal",
        cy.spy().as("personalCollectionSpy"),
      ).as("personalCollection");
    });

    it("should create a dashboard in the personal collection when initialCollectionId is 'personal' and not think that 'personal' is a numeric id", () => {
      cy.intercept("GET", "/api/user/current").as("getCurrentUser");

      mountSdkContent(
        <CreateDashboardModal initialCollectionId={"personal"} />,
      );

      fillAndSubmitForm();

      cy.wait("@getCurrentUser").then(({ response }) => {
        const personalCollectionId = response?.body.personal_collection_id;

        cy.wait("@createDashboard").then(interception => {
          expect(interception.request.body.collection_id).to.equal(
            personalCollectionId,
          );
        });
      });

      cy.get("@personalCollectionSpy").should("not.have.been.called");
    });

    it("should use the personal collection by default if no initialCollectionId is provided", () => {
      cy.intercept("GET", "/api/user/current").as("getCurrentUser");

      mountSdkContent(<CreateDashboardModal />);

      fillAndSubmitForm();

      cy.wait("@getCurrentUser").then(({ response }) => {
        const personalCollectionId = response?.body.personal_collection_id;

        cy.wait("@createDashboard").then(interception => {
          expect(interception.request.body.collection_id).to.equal(
            personalCollectionId,
          );
        });
      });

      cy.get("@personalCollectionSpy").should("not.have.been.called");
    });
  });

  describe("root collection", () => {
    beforeEach(() => {
      signInAsAdminAndEnableEmbeddingSdk();
      cy.signOut();
      mockAuthProviderAndJwtSignIn();

      cy.intercept("POST", "/api/dashboard").as("createDashboard");
    });

    it("should create a dashboard in the root collection when initialCollectionId is 'root'", () => {
      mountSdkContent(<CreateDashboardModal initialCollectionId="root" />);

      fillAndSubmitForm();

      cy.wait("@createDashboard").then(interception => {
        expect(interception.request.body.collection_id).to.equal(null);
      });
    });
  });
});

const fillAndSubmitForm = ({
  name = "test",
  description = "test",
}: {
  name?: string;
  description?: string;
} = {}) => {
  H.modal().findByRole("textbox", { name: "Name" }).type(name);
  H.modal().findByRole("textbox", { name: "Description" }).type(description);
  H.modal().findByRole("button", { name: "Create" }).click();
};
