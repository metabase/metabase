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
        openDropdownFor(collection.name);
        cy.findByText(sub_collection.name);
      });

      it("should be moved under admin's personal collection", () => {
        cy.request("PUT", `/api/collection/${sub_collection.id}`, {
          parent_id: admin.id,
        });

        cy.visit(`/collection/${admin.id}`);
        // this changed in 0.38
        // It used to be "Robert Tableton's personal collection"
        // but since we're logged in as admin, it's showing "Your personal collection"
        openDropdownFor("Your personal collection");
        cy.findByText(sub_collection.name);
      });
    });

    describe.skip("sidebar behavior", () => {
      it("should allow a user to expand a collection without navigating to it", () => {
        cy.visit("/collection/root");
        // 1. click on the chevron to expand the sub collection
        cy.click(".Icon-chevronright");
        // 2. I should see the nested collection name
        cy.findByText("First level");
        // 3. The url should still be /collection/root to test that we haven't navigated away
        //
      });

      describe("deeply nested collection navigation", () => {
        // TODO - create three more collections by posting to the API to test deep nesting.
        // e.x. Third Level -> Fourth Level -> Fifth level with a long name
        /*
        1. Expand out via the chevrons so that all collections are showing
        2. Ensure we can see the entire "Fifth level with a long name" collection text
        */
      });
    });

    describe.skip("managing items", () => {
      // Note - this behavior is broken right now, so let's skip until it's working
      it.skip("should let a user move a collection item via modal", () => {
        cy.visit("/collection/root");
        /*
        1. Click on the ... menu
        2. Select "move this" from the popover
        3. Select a collection that has child collections and hit the right chevron to navigate there
        4. Hit done
        5. I should have been navigated to that collection
        */
      });

      it("should allow a user to pin an item", () => {
        /*
        Starting from a scenario with no pins

        1. Click on the ... menu
        2. Select "pin this" from the popover
        3. Should see "pinned items" and the item should be in that section
        */
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

function openDropdownFor(collectionName) {
  cy.findByText(collectionName)
    .parent()
    .find(".Icon-chevronright")
    .eq(0) // there may be more nested icons, but we need the top level one
    .click();
}
