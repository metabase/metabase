import yaml from "js-yaml";

import type { WorktreeId } from "metabase-types/api";

const { H } = cy;

const BRANCH = "feature-worktree";
const REMOTE_TRANSFORM_FILE = `${H.LOCAL_GIT_PATH}/transforms/BssO7GsawP2WszjcnIjMw_simple_sql_transform.yaml`;
const IMPORTED_TRANSFORM_NAME = "Imported Simple SQL transform";
const RENAMED_TRANSFORM_NAME = "Renamed on the remote";

describe(
  "scenarios > data studio > remote sync worktrees",
  { tags: ["@external"] },
  () => {
    beforeEach(() => {
      H.restore("postgres-writable");
      cy.signInAsAdmin();
      H.activateToken("pro-self-hosted");
      H.updateSetting("transforms-enabled", true);

      cy.log(
        "Publish a transform on a branch of its own; the main app syncs main",
      );
      H.setupGitSync();
      H.checkoutSyncedCollectionBranch(BRANCH);
      H.copySyncedTransformsCollectionFixture();
      H.commitToRepo("Add a transform on the worktree branch");
      H.configureGit("read-write");
      // The remote-changes check is cached server-side; disable the cache so the home page
      // reflects a commit made moments earlier.
      cy.request(
        "PUT",
        "/api/setting/remote-sync-check-changes-cache-ttl-seconds",
        { value: 0 },
      );

      cy.intercept("POST", "/api/ee/remote-sync/worktree").as("createWorktree");
      cy.intercept("POST", "/api/ee/remote-sync/import").as("importChanges");
      cy.intercept("DELETE", "/api/ee/remote-sync/worktree/*").as(
        "deleteWorktree",
      );
    });

    it("can create a worktree for a branch, pull into it, and delete it", () => {
      H.DataStudio.Transforms.visit();

      cy.log("Create a worktree for the branch from the sidebar");
      worktreesSection().findByRole("button", { name: "New worktree" }).click();
      newWorktreeModal()
        .findByLabelText("Branch")
        .should("be.enabled")
        .type(BRANCH);
      cy.findByRole("option", { name: BRANCH }).click();
      newWorktreeModal()
        .should("not.contain", "will be created")
        .button("Create worktree")
        .click();

      cy.wait("@createWorktree").its("response.body.id").as("worktreeId");
      cy.get<WorktreeId>("@worktreeId").then((worktreeId) => {
        cy.log(
          "The branch's content is pulled into the new worktree right away",
        );
        cy.wait("@importChanges").its("request.body").should("deep.include", {
          expected_branch: BRANCH,
          worktree_id: worktreeId,
        });
        cy.location("pathname").should(
          "eq",
          `/data-studio/worktrees/${worktreeId}/transforms`,
        );
        H.pollForWorktreeTask({ worktreeId, taskName: "import" });
      });
      H.closeSyncResultModal();

      worktreesSection()
        .findByRole("link", { name: BRANCH })
        .should("have.attr", "aria-current", "page");
      cy.findByTestId("worktree-breadcrumb").should("contain.text", BRANCH);
      H.DataStudio.Transforms.list()
        .findByText(IMPORTED_TRANSFORM_NAME)
        .should("be.visible");

      cy.log(
        "Advance the branch on the remote while the worktree stays behind",
      );
      renameRemoteTransform(RENAMED_TRANSFORM_NAME);

      cy.log("The home page shows the sync status and offers pull/push");
      worktreesSection().findByRole("link", { name: BRANCH }).click();
      cy.findByTestId("worktree-home-page").within(() => {
        cy.findByTestId("worktree-home-title").should("have.text", BRANCH);
        cy.findByRole("button", { name: "Delete worktree" }).should(
          "be.visible",
        );
        cy.findByRole("button", { name: /Push changes/ }).should("be.disabled");
        cy.findByTestId("worktree-sync-status")
          .should("contain", "Nothing to push")
          .and("contain", "New commits to pull")
          .and("contain", "Pulled");
        cy.findByRole("button", { name: /Pull changes/ })
          .should("be.enabled")
          .click();
      });

      cy.get<WorktreeId>("@worktreeId").then((worktreeId) => {
        cy.wait("@importChanges").its("request.body").should("deep.include", {
          expected_branch: BRANCH,
          worktree_id: worktreeId,
        });
        H.pollForWorktreeTask({ worktreeId, taskName: "import" });
      });
      H.closeSyncResultModal();

      cy.log("The pulled rename shows up in the worktree's transforms");
      worktreesSection().findByRole("link", { name: "Transforms" }).click();
      H.DataStudio.Transforms.list()
        .should("contain", RENAMED_TRANSFORM_NAME)
        .and("not.contain", IMPORTED_TRANSFORM_NAME);

      cy.log("Delete the worktree from its home page");
      cy.findByTestId("worktree-breadcrumb").click();
      cy.findByTestId("worktree-home-page")
        .findByRole("button", { name: "Delete worktree" })
        .click();
      cy.findByRole("dialog", {
        name: `Delete the worktree for "${BRANCH}"?`,
      })
        .button("Delete worktree")
        .click();
      cy.wait("@deleteWorktree");

      cy.log("Back on the main transforms list, which never saw the branch");
      cy.location("pathname").should("eq", "/data-studio/transforms");
      H.DataStudio.Transforms.list()
        .should("be.visible")
        .and("not.contain", RENAMED_TRANSFORM_NAME);
      worktreesSection()
        .should("be.visible")
        .findByRole("link", { name: BRANCH })
        .should("not.exist");
    });
  },
);

const worktreesSection = () =>
  H.DataStudio.nav().findByRole("region", { name: "Worktrees" });

const newWorktreeModal = () =>
  cy.findByRole("dialog", { name: "New worktree" });

// Rewrite the transform's serialized file on the checked-out branch and commit it, so the
// remote is ahead of the worktree.
function renameRemoteTransform(name: string) {
  cy.readFile(REMOTE_TRANSFORM_FILE).then((contents: string) => {
    const doc = yaml.load(contents);
    if (typeof doc !== "object" || doc === null) {
      throw new Error(`Unexpected transform fixture: ${REMOTE_TRANSFORM_FILE}`);
    }
    cy.writeFile(REMOTE_TRANSFORM_FILE, yaml.dump({ ...doc, name }));
  });
  H.commitToRepo("Rename the transform on the remote");
}
