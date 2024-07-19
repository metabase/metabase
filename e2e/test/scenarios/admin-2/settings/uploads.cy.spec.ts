import { describeEE, restore, setTokenFeatures } from "e2e/support/helpers";

const mockSessionPropertiesTokenFeatures = (features: {
  [k: string]: boolean;
}) => {
  cy.intercept({ method: "GET", url: "/api/session/properties" }, request => {
    request.on("response", response => {
      if (typeof response.body === "object") {
        response.body = {
          ...response.body,
          "token-features": {
            ...response.body["token-features"],
            ...features,
          },
        };
      }
    });
  });
};

describe("scenarios > admin > uploads (OSS)", { tags: "@OSS" }, () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should show the uploads settings page", () => {
    cy.visit("/admin/settings/uploads");
    cy.findAllByText("Database to use for uploads");
  });
});

describeEE("scenarios > admin > uploads (EE)", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    setTokenFeatures("all");
  });

  it("without attached-dwh should show the uploads settings page", () => {
    mockSessionPropertiesTokenFeatures({ attached_dwh: false });
    cy.visit("/admin/settings/uploads");
    cy.findAllByText("Database to use for uploads");
  });

  it("with attached-dwh should not show the uploads settings page", () => {
    mockSessionPropertiesTokenFeatures({ attached_dwh: true });
    cy.visit("/admin/settings/uploads");
    cy.findAllByText("The page you asked for couldn't be found.");
  });
});
