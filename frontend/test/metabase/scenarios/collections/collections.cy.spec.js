import {
  restore,
  signInAsAdmin,
  setupLocalHostEmail,
  signInAsNormalUser,
  modal,
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
        cy.findByText(sub_collection.name);
      });
    });

    describe("sidebar behavior", () => {
      beforeEach(() => {
        restore();
        signInAsAdmin();
      });

      it("should allow a user to expand a collection without navigating to it", () => {
        cy.visit("/collection/root");
        // 1. click on the chevron to expand the sub collection
        openDropdownFor("First collection");
        // 2. I should see the nested collection name
        cy.findByText("First collection");
        cy.findByText("Second collection");
        // 3. The url should still be /collection/root to test that we haven't navigated away
        cy.location("pathname").should("eq", "/collection/root");
        //
      });

      describe("deeply nested collection navigation", () => {
        it("should correctly display deep nested collections", () => {
          cy.request("GET", "/api/collection").then(xhr => {
            // "Third collection" is the last nested collection in the snapshot (data set)
            // we need its ID to continue nesting below it
            const THIRD_COLLECTION_ID = xhr.body.length - 1;

            // sanity check and early alarm if the initial data set changes in the future
            expect(xhr.body[THIRD_COLLECTION_ID].name).to.eq(
              "Third collection",
            );

            cy.log("**-- Create two more nested collections --**");
            [
              "Fourth collection",
              "Fifth collection with a very long name",
            ].forEach((collection, index) => {
              cy.request("POST", "/api/collection", {
                name: collection,
                parent_id: THIRD_COLLECTION_ID + index,
                color: "#509ee3",
              });
            });
          });
          cy.visit("/collection/root");
          // 1. Expand out via the chevrons so that all collections are showing
          openDropdownFor("First collection");
          openDropdownFor("Second collection");
          openDropdownFor("Third collection");
          openDropdownFor("Fourth collection");
          // 2. Ensure we can see the entire "Fifth level with a long name" collection text
          cy.findByText("Fifth collection with a very long name");
        });
      });
    });

    describe("managing items", () => {
      it("should let a user move a collection item via modal", () => {
        cy.visit("/collection/root");

        // 1. Click on the ... menu
        openEllipsisMenuFor("Orders");

        // 2. Select "move this" from the popover
        cy.findByText("Move this item").click();
        modal().within(() => {
          cy.findByText(`Move "Orders"?`);
          // 3. Select a collection that has child collections and hit the right chevron to navigate there
          cy.findByText("First collection")
            .next() // right chevron icon
            .click();
          cy.findByText("Second collection").click();
          // 4. Move that item
          cy.findByText("Move").click();
        });
        // Assert that the item no longer exists in "Our collection"...
        cy.findByText("Orders").should("not.exist");

        openDropdownFor("First collection");
        // ...and that it is indeed moved inside "Second collection"
        cy.findByText("Second collection").click();
        cy.findByText("Orders");
      });

      it("should allow a user to pin an item", () => {
        cy.visit("/collection/root");
        // Assert that we're starting from a scenario with no pins
        cy.findByText("Pinned items").should("not.exist");

        // 1. Click on the ... menu
        openEllipsisMenuFor("Orders in a dashboard");

        // 2. Select "pin this" from the popover
        cy.findByText("Pin this item").click();

        // 3. Should see "pinned items" and the item should be in that section
        cy.findByText("Pinned items")
          .parent()
          .contains("Orders in a dashboard");
        // 4. Consequently, "Everything else" should now also be visible
        cy.findByText("Everything else");
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

function openEllipsisMenuFor(item) {
  cy.findByText(item)
    .closest("a")
    .find(".Icon-ellipsis")
    .click({ force: true });
}
