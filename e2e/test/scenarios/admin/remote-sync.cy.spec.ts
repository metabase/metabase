import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";
import type { Collection } from "metabase-types/api";

const { PRODUCTS_ID } = SAMPLE_DATABASE;

const { H } = cy;

const LOCAL_GIT_URL = "file://" + H.LOCAL_GIT_PATH + "/.git";

const REMOTE_QUESTION_NAME = "Remote Sync Test Question";

describe("Remote Sync", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    H.setupGitSync();
    H.interceptTask();
  });

  describe("Development Mode", () => {
    it("can push and pull changes", () => {
      H.configureGit("development");
      H.wrapLibraryCollection();
      const UPDATED_REMOTE_QUESTION_NAME = "Updated Question Name";

      cy.get("@library").then((libraryCollection) => {
        H.createQuestion({
          name: REMOTE_QUESTION_NAME,
          query: {
            "source-table": PRODUCTS_ID,
          },
          collection_id: (libraryCollection as unknown as Collection)
            .id as number,
        });
      });

      cy.visit("/");

      // Ensure that status icon is present
      H.getSyncStatusIndicators().should("have.length.greaterThan", 0);
      H.navigationSidebar()
        .findByRole("link", { name: /Library/ })
        .click();

      H.collectionTable().findByText(REMOTE_QUESTION_NAME).should("exist");

      H.navigationSidebar()
        .findByRole("button", { name: "Push to Git" })
        .click();

      H.modal()
        .button(/Push changes/)
        .click();

      H.waitForTask({ taskName: "export" });

      H.navigationSidebar()
        .findByRole("link", { name: /Library/ })
        .findByTestId("remote-sync-status")
        .should("not.exist");

      H.updateRemoteQuestion(
        (doc) => {
          doc.name = UPDATED_REMOTE_QUESTION_NAME;
          return doc;
        },
        (doc) => {
          expect(doc.name).to.equal(REMOTE_QUESTION_NAME);
        },
      );

      cy.findByTestId("main-navbar-root")
        .findByRole("button", { name: "Pull from Git" })
        .click();

      H.waitForTask({ taskName: "import" });

      H.collectionTable()
        .findByText(UPDATED_REMOTE_QUESTION_NAME)
        .should("exist");
    });

    it("should not allow you to move content to the library that references non library items", () => {
      H.configureGit("development");
      H.wrapLibraryCollection();
      cy.intercept("PUT", `/api/dashboard/${ORDERS_DASHBOARD_ID}`).as(
        "updateDashboard",
      );

      cy.visit("/collection/root");

      H.getSyncStatusIndicators().should("have.length", 0);

      H.openCollectionItemMenu("Orders in a dashboard");
      H.popover().findByText("Move").click();

      H.entityPickerModal().within(() => {
        H.entityPickerModalTab("Collections").click();
        H.entityPickerModalItem(1, "Library").click();
        cy.button("Move").click();
      });

      cy.wait("@updateDashboard").then((req) => {
        expect(req.response?.statusCode).to.eq(400);
        expect(req.response?.body.message).to.contain(
          "non-remote-synced dependencies",
        );
      });

      H.entityPickerModal().button("Cancel").click();
      H.openCollectionItemMenu("Orders, Count");
      H.popover().findByText("Move").click();

      H.entityPickerModal().within(() => {
        H.entityPickerModalTab("Browse").click();
        H.entityPickerModalItem(1, "Library").click();
        cy.button("Move").click();
      });

      H.getSyncStatusIndicators().should("have.length", 1);
    });

    it("should show a warning modal when you try to push but are out of date", () => {
      const NEW_BRANCH = `new-branch-${Date.now()}`;
      H.copyLibraryFixture();
      H.commitToLibrary();
      H.configureGit("development");
      H.wrapLibraryCollection();

      cy.visit("/collection/root");

      // Make a change in metabase
      H.moveCollectionItemToLibrary("Orders");

      // Make a change outside metabase
      H.updateRemoteQuestion((doc) => {
        doc.name = "Sloan for Frontend Emperor";
        return doc;
      });

      H.navigationSidebar()
        .findByRole("button", { name: "Push to Git" })
        .click();

      // Attempt to push changes
      cy.findByRole("dialog", { name: "Push to Git" })
        .button(/Push changes/)
        .click();

      // push local changes to a different branch, because the remote is ahead of us
      cy.findByRole("dialog", { name: /branch is behind/ }).within(() => {
        cy.findByRole("radio", { name: /Create a new branch/ }).click();
        cy.findByPlaceholderText("your-branch-name").type(NEW_BRANCH);
        cy.button("Push changes").click();
      });

      H.waitForTask({ taskName: "export" });

      // Ensure that we are on the newly created branch
      H.navigationSidebar()
        .findByTestId("branch-picker-button")
        .should("contain.text", NEW_BRANCH);
      H.goToLibrary();

      H.collectionTable().within(() => {
        // Question we just moved
        cy.findByText("Orders");
        // Question we previously had in the library
        cy.findByText("Remote Sync Test Question");
      });

      H.navigationSidebar().findByTestId("branch-picker-button").click();
      H.popover().findByRole("option", { name: "main" }).click();

      H.waitForTask({ taskName: "import" });

      // Upstream change will get pulled when switching branches
      H.collectionTable()
        .findByText("Sloan for Frontend Emperor")
        .should("exist");
    });

    describe("Branching", () => {
      const createNewBranch = (newBranchName: string) => {
        H.navigationSidebar().findByTestId("branch-picker-button").click();
        H.popover()
          .findByPlaceholderText("Find or create a branch...")
          .type(newBranchName);
        H.popover()
          .findByRole("option", { name: /Create branch/ })
          .click();

        H.navigationSidebar()
          .findByTestId("branch-picker-button")
          .should("contain.text", newBranchName);
      };

      const switchToExistingBranch = (branch: string) => {
        H.navigationSidebar().findByTestId("branch-picker-button").click();
        H.popover()
          .findByPlaceholderText("Find or create a branch...")
          .type(branch);
        cy.findByRole("option", { name: branch }).click();
      };

      const pushUpdates = () => {
        H.navigationSidebar()
          .findByRole("button", { name: "Push to Git" })
          .click();

        H.modal()
          .button(/Push changes/)
          .click();

        H.waitForTask({ taskName: "export" });
        // Push button should be hidden when local changes are synced
        H.navigationSidebar()
          .findByRole("button", { name: "Push to Git" })
          .should("not.exist");
      };

      it("should allow you to create new branches and switch between them", () => {
        H.configureGit("development");
        H.wrapLibraryCollection();

        const NEW_BRANCH_1 = `new-branch-${Date.now()}`;
        const NEW_BRANCH_2 = `new-branch-${Date.now() + 1}`;

        cy.visit("/collection/root");

        H.navigationSidebar()
          .findByRole("treeitem", { name: /Library/ })
          .click();

        // Synced Library starts empty
        H.collectionTable().should("not.exist");
        cy.findByTestId("collection-empty-state").should("exist");

        createNewBranch(NEW_BRANCH_1);

        // Move something into Library for the new branch
        H.moveCollectionItemToLibrary("Orders, Count");

        pushUpdates();

        // Go back to the main branch
        createNewBranch(NEW_BRANCH_2);

        H.moveCollectionItemToLibrary("Orders Model");

        H.collectionTable().findByText("Orders, Count").should("exist");
        H.collectionTable().findByText("Orders Model").should("exist");
        pushUpdates();

        // Go back to the first branch
        switchToExistingBranch(NEW_BRANCH_1);

        H.collectionTable().findByText("Orders, Count").should("exist");
        // The second item should not exist in the first branch
        H.collectionTable().findByText("Orders Model").should("not.exist");
      });

      it("should show a popup when trying to switch branches with unsynced changes", () => {
        H.configureGit("development");

        const NEW_BRANCH = `new-branch-${Date.now()}`;

        cy.visit("/collection/root");

        H.navigationSidebar()
          .findByRole("treeitem", { name: /Library/ })
          .click();

        // Synced Library starts empty
        H.collectionTable().should("not.exist");
        cy.findByTestId("collection-empty-state").should("exist");

        createNewBranch(NEW_BRANCH);

        // Move something into Library for the new branch
        H.moveCollectionItemToLibrary("Orders, Count");

        // Attempt to go back to main
        switchToExistingBranch("main");

        // Check that we haven't switched to main
        H.navigationSidebar()
          .findByTestId("branch-picker-button")
          .should("not.contain.text", "main");

        H.modal().should("exist");
        H.modal().within(() => {
          cy.findByRole("heading", {
            name: "You have unsynced changes. What do you want to do?",
          });
          cy.findByLabelText(
            "Push changes to the current branch, " + NEW_BRANCH,
          );
          cy.findByLabelText("Create a new branch and push changes there");

          // Choose discard so that we can switch later
          cy.findByLabelText(
            "Delete unsynced changes (can’t be undone)",
          ).click();
          cy.button(/Delete unsynced changes/).click();
        });

        // Now we switched to main
        H.navigationSidebar()
          .findByTestId("branch-picker-button")
          .should("contain.text", "main");
      });
    });

    describe("unsynced changes", () => {
      beforeEach(() => {
        H.copyLibraryFixture();
        H.commitToLibrary();
        H.configureGit("development");
        H.wrapLibraryCollection();

        cy.visit("/collection/root");

        // Make a change in metabase
        H.moveCollectionItemToLibrary("Orders");

        H.goToLibrary();
        H.navigationSidebar()
          .findByRole("button", { name: "Pull from Git" })
          .click();
      });

      it("push changes", () => {
        cy.findByRole("dialog", { name: /unsynced changes/ }).within(() => {
          cy.findByRole("radio", { name: /Push changes/ }).click();
          cy.button("Push changes").click();
        });

        H.waitForTask({ taskName: "export" });

        H.branchPicker().should("contain.text", "main");
        H.collectionTable().within(() => {
          cy.findByText("Orders").should("exist");
          cy.findByText(REMOTE_QUESTION_NAME).should("exist");
        });
      });

      it("new branch", () => {
        const NEW_BRANCH = `new-branch-${Date.now()}`;
        cy.findByRole("dialog", { name: /unsynced changes/ }).within(() => {
          cy.findByRole("radio", { name: /new branch/ }).click();
          cy.findByPlaceholderText("your-branch-name").type(NEW_BRANCH);
          cy.button("Push changes").click();
        });

        H.waitForTask({ taskName: "export" });

        H.branchPicker().should("contain.text", NEW_BRANCH);
        H.collectionTable().within(() => {
          cy.findByText("Orders").should("exist");
          cy.findByText(REMOTE_QUESTION_NAME).should("exist");
        });

        H.branchPicker().click();
        H.popover().findByRole("option", { name: "main" }).click();

        H.waitForTask({ taskName: "import" });
        H.collectionTable().within(() => {
          cy.findByText("Orders").should("not.exist");
          cy.findByText(REMOTE_QUESTION_NAME).should("exist");
        });
      });

      it("delete changes", () => {
        cy.findByRole("dialog", { name: /unsynced changes/ }).within(() => {
          cy.findByRole("radio", { name: /Delete/ }).click();
          cy.button("Delete unsynced changes").click();
        });

        H.waitForTask({ taskName: "import" });

        H.branchPicker().should("contain.text", "main");
        H.collectionTable().within(() => {
          cy.findByText("Orders").should("not.exist");
          cy.findByText(REMOTE_QUESTION_NAME).should("exist");
        });
      });

      it("upstream changes", () => {
        // Make a change outside metabase
        H.updateRemoteQuestion((doc) => {
          doc.name = "Sloan for Frontend Emperor";
          return doc;
        });

        cy.findByRole("dialog", { name: /unsynced changes/ }).within(() => {
          cy.findByRole("radio", { name: /Push/ }).click();
          cy.button("Push changes").click();
        });

        cy.findByRole("list", { name: /undo-list/i }).findByText(
          /Cannot export changes/,
        );
      });
    });
  });

  describe("remote sync admin settings page", () => {
    beforeEach(() => {
      H.restore();
      H.activateToken("bleeding-edge");
      H.setupGitSync();
      cy.signInAsAdmin();
    });

    it("can set up development mode", () => {
      cy.visit("/admin/settings/remote-sync");
      cy.findByLabelText(/repository url/i)
        .clear()
        .type(LOCAL_GIT_URL);
      cy.findByTestId("admin-layout-content").findByText("Development").click();
      cy.button("Set up Remote Sync").click();
      cy.findByTestId("admin-layout-content")
        .findByText("Success")
        .should("exist");

      H.waitForTask({ taskName: "import" });
      H.modal().should("not.exist");
      cy.findByTestId("exit-admin").click();

      H.navigationSidebar().within(() => {
        cy.findByRole("heading", { name: /synced collections/i }).should(
          "exist",
        );
        cy.findByTestId("branch-picker-button").should("contain.text", "main");
        cy.findByRole("treeitem", { name: /library/i }).should("exist");
      });
    });

    it("can set up production mode", () => {
      // Set up a library to connect to, otherwise production mode will be empty
      // Copy some files
      H.copyLibraryFixture();

      // Commit those files to the main branch
      H.commitToLibrary();

      cy.visit("/admin/settings/remote-sync");
      cy.findByLabelText(/repository url/i)
        .clear()
        .type(LOCAL_GIT_URL);

      cy.findByTestId("admin-layout-content").findByText("Production").click();
      cy.button("Set up Remote Sync").click();
      cy.findByTestId("admin-layout-content")
        .findByText("Success")
        .should("exist");

      H.modal().should("not.exist", { timeout: 10000 });
      cy.findByTestId("exit-admin").click();

      H.navigationSidebar().within(() => {
        cy.findByRole("heading", { name: /synced collections/i }).should(
          "not.exist",
        );
        cy.findByTestId("branch-picker-button").should("not.exist");

        cy.findByRole("treeitem", { name: /Library/ }).click();
      });
    });

    it("shows an error if git settings are invalid", () => {
      cy.intercept("PUT", "/api/ee/remote-sync/settings").as("saveSettings");
      cy.visit("/admin/settings/remote-sync");
      cy.findByLabelText(/repository url/i)
        .clear()
        .type("file://invalid-path");
      cy.button("Set up Remote Sync").click();

      cy.wait("@saveSettings").its("response.statusCode").should("eq", 400);
      cy.findByTestId("admin-layout-content")
        .findByText("Failed")
        .should("exist");
      cy.findByTestId("admin-layout-content")
        .findByText(
          "Failed to clone git repository: Git CloneCommand failed: URI not supported: file://invalid-path",
        )
        .should("exist");
    });
  });

  describe("production mode", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
      H.activateToken("bleeding-edge");
      H.setupGitSync();
    });

    it("can change branches", () => {
      const UPDATED_REMOTE_QUESTION_NAME = "New Name";

      H.copyLibraryFixture();
      H.commitToLibrary();
      H.configureGit("production");

      cy.visit("/");

      H.navigationSidebar()
        .findByRole("treeitem", { name: /Library/ })
        .click();
      H.collectionTable().findByText(REMOTE_QUESTION_NAME);

      // Make a change, and commit it to the branch
      H.checkoutLibraryBranch("test");
      H.updateRemoteQuestion((doc) => {
        doc.name = UPDATED_REMOTE_QUESTION_NAME;
        return doc;
      });

      cy.visit("/admin/settings/remote-sync");
      cy.findByLabelText("Sync branch").clear().type("test");
      cy.button("Save changes").click();

      cy.findByTestId("admin-layout-content")
        .findByText("Success")
        .should("exist");

      cy.findByRole("dialog", { name: "Switch branches?" })
        .button("Continue")
        .click();

      H.waitForTask({ taskName: "import" });

      cy.findByRole("button", { name: "Save changes" }).should("be.disabled");

      cy.visit("/");

      H.navigationSidebar()
        .findByRole("treeitem", { name: /Library/ })
        .click();
      H.collectionTable().findByText(UPDATED_REMOTE_QUESTION_NAME);
    });
  });
});
