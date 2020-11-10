import {
  restore,
  signInAsAdmin,
  setupLocalHostEmail,
  signInAsNormalUser,
} from "__support__/cypress";
// Ported from initial_collection.e2e.spec.js

// Z because the api lists them alphabetically by name, so it makes it easier to check
const [admin, collection, sub_collection] = [
  {
    name: "Robert Tableton's Personal Collection",
    id: 1,
  },
  {
    name: "Z Collection",
    id: null, // TBD from a response body
  },
  {
    name: "ZZ Sub-Collection",
    id: null, // TBD from a response body
  },
];

const pulse_name = "Test pulse";
const dashboard_name = "Test Dashboard";

describe("scenarios > collection_defaults", () => {
  before(restore);

  describe("for admins", () => {
    beforeEach(signInAsAdmin);

    describe("a new collection", () => {
      before(() => {
        signInAsAdmin();
        cy.request("POST", "/api/collection", {
          name: collection.name,
          color: "#ff9a9a",
        }).then(({ body }) => {
          collection.id = body.id;
        });
      });

      it("should be the parent collection", () => {
        const LENGTH = collection.id + 1;
        cy.request("GET", "/api/collection").then(response => {
          expect(response.body).to.have.length(LENGTH);
          expect(response.body[collection.id].name).to.equal(collection.name);
          // Check that it has no parent
          expect(response.body[collection.id].location).to.equal("/");
        });
      });

      it("should be visible within a root collection in a sidebar", () => {
        cy.visit("/collection/root");
        cy.findByText(collection.name);
      });
    });

    describe("a new sub-collection", () => {
      before(() => {
        signInAsAdmin();
        // Create a sub collection within previously added ("Z collection")
        cy.request("POST", "/api/collection", {
          name: sub_collection.name,
          color: "#ff9a9a",
          parent_id: collection.id,
        }).then(({ body }) => {
          sub_collection.id = body.id;
        });
      });

      it("should be a sub collection", () => {
        const LENGTH = sub_collection.id + 1;
        cy.request("GET", "/api/collection").then(response => {
          expect(response.body).to.have.length(LENGTH);
          expect(response.body[sub_collection.id].name).to.equal(
            sub_collection.name,
          );
          // Check that it has a parent (and that it is a "Z collection")
          expect(response.body[sub_collection.id].location).to.equal(
            `/${collection.id}/`,
          );
        });
      });

      it("should be nested under parent on a parent's URL in a sidebar", () => {
        cy.visit("/collection/root");
        cy.findByText(sub_collection.name).should("not.exist");

        cy.visit(`/collection/${collection.id}`);
        cy.get(".Icon-chevronright").click();
        cy.findByText(sub_collection.name);
      });

      it("should be moved under admin's personal collection", () => {
        cy.request("PUT", `/api/collection/${sub_collection.id}`, {
          parent_id: admin.id,
        });

        cy.visit(`/collection/${admin.id}`);
        cy.get(".Icon-chevronright").click();
        cy.findByText(sub_collection.name);
      });
    });

    // [quarantine]: cannot run tests that rely on email setup in CI (yet)
    describe.skip("a new pulse", () => {
      it("should be in the root collection", () => {
        // Configure email
        cy.visit("/admin/settings/email");
        setupLocalHostEmail();

        // Make new pulse
        createPulse();

        // Check for pulse in root collection
        cy.visit("/collection/root");
        cy.findByText("My personal collection").then(() => {
          cy.get(".Icon-pulse");
        });

        // cy.request("/api/pulse").then((response) => {
        //     // *** Should the value here really be nll or should it be "root"?
        //     expect(response.body[0].collection_id).to.have.value(null);
        // });
      });
    });

    describe("a new dashboard", () => {
      it("should be in the root collection", () => {
        // Make new dashboard and check collection name
        cy.request("POST", "/api/dashboard", { name: dashboard_name });

        cy.visit("/collection/root");
        cy.findByText(dashboard_name);
      });
    });
  });

  describe("for users", () => {
    before(restore);
    beforeEach(signInAsNormalUser);

    // [quarantine]: cannot run tests that rely on email setup in CI (yet)
    describe.skip("a new pulse", () => {
      before(() => {
        signInAsAdmin();
        cy.visit("/admin/settings/email");
        setupLocalHostEmail();
      });

      it("should be in the root collection", () => {
        // Make new pulse
        createPulse();

        // Check for pulse in root collection
        cy.visit("/collection/root");
        cy.findByText("My personal collection");
        cy.get(".Icon-pulse");
      });
    });

    describe("a new dashboard", () => {
      it("should be in the root collection", () => {
        // Make new dashboard and check collection name
        cy.request("POST", "/api/dashboard", { name: dashboard_name });

        cy.visit("/collection/root");
        cy.findByText(dashboard_name);
      });
    });
  });
});

function createPulse() {
  cy.visit("/pulse/create");
  cy.findByPlaceholderText("Important metrics").type(pulse_name);
  cy.findByText("Select a question").click();
  cy.findByText("Orders").click();
  cy.findByPlaceholderText(
    "Enter email addresses you'd like this data to go to",
  )
    .click()
    .clear();
  cy.contains("Bobby").click();
  cy.findByText("To:").click();

  cy.findByText("Robert Tableton").should("not.exist");
  cy.findByText("Bobby Tables");
  cy.findByText("Create pulse").click();
}
