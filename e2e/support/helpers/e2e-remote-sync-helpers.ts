import yaml from "js-yaml";

import type { Collection } from "metabase-types/api";

import { openCollectionItemMenu } from "./e2e-collection-helpers";
import {
  collectionTable,
  entityPickerModal,
  entityPickerModalItem,
  navigationSidebar,
  popover,
} from "./e2e-ui-elements-helpers";

export const LOCAL_GIT_PATH =
  Cypress.config("projectRoot") + "/e2e/tmp/test-repo";
export const SYNCED_COLLECTION_FIXTURE_PATH =
  Cypress.config("projectRoot") +
  "/e2e/support/assets/example_synced_collection";
export const SYNCED_TRANSFORMS_COLLECTION_FIXTURE_PATH =
  Cypress.config("projectRoot") +
  "/e2e/support/assets/example_synced_transforms_collection";

// Copy the sample synced collection from the fixture folder to the working directory
export const copySyncedCollectionFixture = () => {
  cy.task("copyDirectory", {
    source: SYNCED_COLLECTION_FIXTURE_PATH,
    destination: LOCAL_GIT_PATH,
  });
};
// Copy the sample synced transforms collection from the fixture folder to the working directory
export const copySyncedTransformsCollectionFixture = () => {
  cy.task("copyDirectory", {
    source: SYNCED_TRANSFORMS_COLLECTION_FIXTURE_PATH,
    destination: LOCAL_GIT_PATH,
  });
};

export const checkoutSyncedCollectionBranch = (branch: string) => {
  cy.exec("git -C " + LOCAL_GIT_PATH + ` checkout -b  '${branch}'`);
};

// Create a branch at the current commit without checking it out
export const createRemoteBranch = (branch: string) => {
  cy.exec("git -C " + LOCAL_GIT_PATH + ` branch '${branch}'`);
};

/**
 * Move a branch forward by one commit. Uses plumbing rather than a checkout because the backend
 * writes straight into `.git` and leaves the working directory behind (see `stashChanges`), so
 * checking a branch out here would fight with it.
 */
export const advanceRemoteBranch = (
  branch: string,
  message = "Remote update",
) => {
  cy.exec(
    `commit=$(git -C '${LOCAL_GIT_PATH}' commit-tree '${branch}^{tree}' -p '${branch}' -m '${message}') && ` +
      `git -C '${LOCAL_GIT_PATH}' update-ref 'refs/heads/${branch}' "$commit"`,
  );
};

export const commitToRepo = (
  message = "Adding content to synced collection",
) => {
  cy.exec(
    "git -C " +
      LOCAL_GIT_PATH +
      " add .; git -C " +
      LOCAL_GIT_PATH +
      ` commit -am '${message}'`,
  );
};

// Setup remote sync via the API
export function configureGit(
  syncType: "read-write" | "read-only",
  syncUrl = "file://" + LOCAL_GIT_PATH + "/.git",
  collections?: Record<number, boolean>,
) {
  cy.request("PUT", "/api/ee/remote-sync/settings", {
    "remote-sync-branch": "main",
    "remote-sync-type": syncType,
    "remote-sync-url": syncUrl,
    "remote-sync-enabled": true,
    ...(collections && { collections }),
  });
}

// Setup remote sync via the API and wait for/trigger the initial import
export function configureGitAndPullChanges(
  syncType: "read-write" | "read-only",
  syncUrl = "file://" + LOCAL_GIT_PATH + "/.git",
) {
  configureGit(syncType, syncUrl);

  if (syncType === "read-only") {
    // Read-only mode automatically triggers an import, just wait for it
    pollForTask({ taskName: "import" });
  } else {
    // Read-write mode needs manual import trigger. expected_branch asserts the client's view of the
    // active branch against the setting (configureGit sets it to "main").
    cy.request("POST", "/api/ee/remote-sync/import", {
      expected_branch: "main",
    });
    pollForTask({ taskName: "import" });
  }
}

// Setup remote sync with a new synced collection in one step
export function configureGitWithNewSyncedCollection(
  syncType: "read-write" | "read-only",
  collectionName = "Test Synced Collection",
  syncUrl = "file://" + LOCAL_GIT_PATH + "/.git",
) {
  return cy
    .request("POST", "/api/collection", { name: collectionName })
    .then((response) => {
      const collection = response.body;
      configureGit(syncType, syncUrl, { [collection.id]: true });
      return cy.wrap(collection);
    });
}

// Prepare the local git repo and initializing with an empty commit
export function setupGitSync() {
  cy.exec("rm -rf " + LOCAL_GIT_PATH);
  cy.exec("git config --global init.defaultBranch main");
  cy.exec("git init " + LOCAL_GIT_PATH);
  cy.exec(
    `git -C ${LOCAL_GIT_PATH} config user.email 'toucan@metabase.com'; git -C ${LOCAL_GIT_PATH} config user.name 'Toucan Cam'`,
  );
  cy.exec(
    "git -C " + LOCAL_GIT_PATH + " commit --allow-empty -m 'Initial Commit'",
  );
}

// This is a bit strange, but when working locally we write directly to the .git folder, not the working
// directory. git will see an empty working directory and assume we have deleted files, so by stashing
// unstaged changes, we will reset the working directory to what is in the .git folder
export const stashChanges = () => {
  cy.exec("git -C " + LOCAL_GIT_PATH + " add .");
  cy.exec("git -C " + LOCAL_GIT_PATH + " stash");
};

// function to examine the working directory and return an array of the files present
export const wrapSyncedCollectionFiles = (alias = "syncedCollectionFiles") => {
  stashChanges();
  cy.task("readDirectory", LOCAL_GIT_PATH).then((files) => {
    cy.wrap(
      // Unjustified type cast. FIXME
      (files as string[]).filter(
        (file: string) => !file.includes(".git") && file.includes(".yaml"),
      ),
    ).as(alias);
  });
};

// Wraps the synced collection for use in tests
export const wrapSyncedCollection = (alias = "syncedCollection", n = 0) => {
  if (n > 3) {
    throw new Error("Could not find Synced Collection");
  }

  cy.request("/api/collection").then(({ body: collections }) => {
    const syncedCollection = collections.find(
      (c: Collection) => c.is_remote_synced && c.location === "/",
    );

    if (syncedCollection) {
      cy.wrap(syncedCollection).as(alias);
    } else {
      cy.wait(500);
      wrapSyncedCollection(alias, n + 1);
    }
  });
};

export const getSyncStatusIndicators = () =>
  navigationSidebar().findAllByTestId("remote-sync-status");

export const updateRemoteQuestion = (
  updateFn: (val: Record<string, any>) => Record<string, any>,
  assertionsFn?: (val: Record<string, any>) => void,
  commitMessage = "Local Update",
) => {
  wrapSyncedCollectionFiles();
  cy.get("@syncedCollectionFiles").then((syncedCollectionFiles) => {
    // Unjustified type cast. FIXME
    const questionFilePath = (
      syncedCollectionFiles as unknown as string[]
    ).find((file) => file.includes("remote_sync_test_question.yaml"));

    const fullPath = `${LOCAL_GIT_PATH}/${questionFilePath}`;

    cy.readFile(fullPath).then((str) => {
      // Unjustified type cast. FIXME
      const doc = yaml.load(str) as Record<string, unknown>;

      assertionsFn?.(doc);

      const updatedDoc = updateFn(doc);

      cy.writeFile(fullPath, yaml.dump(updatedDoc));
      cy.exec(`git -C ${LOCAL_GIT_PATH} commit -am '${commitMessage}'`);
    });
  });
};

export const moveCollectionItemToSyncedCollection = (
  name: string,
  targetCollection = "Synced Collection",
) => {
  navigationSidebar()
    .findByRole("treeitem", { name: /Our analytics/ })
    .click();

  openCollectionItemMenu(name);
  popover().findByText("Move").click();

  entityPickerModal().within(() => {
    entityPickerModalItem(1, targetCollection).click();
    cy.button("Move").click();
  });

  getSyncStatusIndicators().should("have.length", 1);

  navigationSidebar()
    .findByRole("treeitem", { name: new RegExp(targetCollection) })
    .click();
  collectionTable().findByText(name).should("exist");
};

export const goToSyncedCollection = (
  collectionName = "Synced Collection",
  opts?: Partial<Cypress.ClickOptions>,
) =>
  navigationSidebar()
    .findByRole("treeitem", { name: new RegExp(collectionName) })
    .click(opts);

// --- Push / pull, driven from Content Studio ---

// The branch the studio is scoped to. On the main scope it reads "Main (<branch>)".
export const getContentStudioBranchSelector = () =>
  cy.findByTestId("content-studio-branch-selector");

export const getContentStudioSyncControls = () =>
  cy.findByTestId("content-studio-sync-controls");

export const visitContentStudio = () => {
  cy.visit("/content-studio");
  getContentStudioBranchSelector().should("be.visible");
};

const ensureSyncMenuOpen = () => {
  getContentStudioSyncControls().then(($button) => {
    if ($button.attr("aria-expanded") !== "true") {
      // Re-query rather than reuse `$button`: the control re-renders as sync state
      // arrives, which would leave a wrapped element detached by the time it is clicked.
      getContentStudioSyncControls().click();
    }
  });
};

const PULL_OPTION_NAME = /Pull changes/;
const PUSH_OPTION_NAME = /Push changes/;

export const getPullOption = () => {
  ensureSyncMenuOpen();
  return cy.findByRole("menuitem", { name: PULL_OPTION_NAME });
};

export const getPushOption = () => {
  ensureSyncMenuOpen();
  return cy.findByRole("menuitem", { name: PUSH_OPTION_NAME });
};

// Mantine menu items can drop a synthetic `.click()` if the dropdown's state machine isn't fully
// wired yet (the dropdown is visible but the item's handler isn't attached). `realClick` dispatches
// native mouse events that Mantine processes reliably. The target's `aria-expanded` is the signal
// that the item fired: Mantine flips it as the item's handler closes the dropdown, before the close
// transition runs. Re-clicking the item directly — rather than through the getter, which would
// reopen the menu — keeps a retry from firing the action twice.
const clickSyncMenuItem = (name: RegExp) => {
  ensureSyncMenuOpen();
  cy.findByRole("menuitem", { name }).should("not.be.disabled").realClick();

  getContentStudioSyncControls().then(($button) => {
    if ($button.attr("aria-expanded") === "true") {
      cy.log("content studio sync menu didn't close — re-clicking item");
      cy.findByRole("menuitem", { name }).click();
    }
  });
};

export const clickPullOption = () => clickSyncMenuItem(PULL_OPTION_NAME);
export const clickPushOption = () => clickSyncMenuItem(PUSH_OPTION_NAME);

// --- Content Studio scope & content ---

// The branch picker is a Combobox, so its options live in a portalled dropdown.
const getContentStudioBranchOptions = () =>
  cy.findByRole("listbox", { name: "Branches" });

const openContentStudioBranchSelector = () => {
  getContentStudioBranchSelector().findByRole("button").click();
  return getContentStudioBranchOptions();
};

/**
 * Check out a branch that already exists on the remote. The checkout imports the branch's content,
 * so callers wait for the import task afterwards.
 */
export const checkOutContentStudioBranch = (branch: string) => {
  openContentStudioBranchSelector()
    .findByRole("option", { name: /Check out a branch/ })
    .click();

  const checkOutModal = () =>
    cy.findByRole("dialog", { name: "Check out a branch" });

  checkOutModal().findByLabelText("Branch").type(branch);
  // The autocomplete's suggestions are portalled over the modal's buttons; picking one closes them.
  cy.findByRole("option", { name: branch }).click();
  checkOutModal().button("Check out branch").click();
};

// One of the studio's three sidebar trees, named by its section title.
export const getContentStudioTree = (name: string) =>
  cy.findByRole("tree", { name });

// The folders and entities the studio's content pane lists outside a collection.
export const getContentStudioFolderContents = () =>
  cy.findByTestId("content-studio-folder-contents");

// --- Branch switching, driven from the instance Settings panel ---

export const visitRemoteSyncSettings = () =>
  cy.visit("/admin/settings/remote-sync");

// The read-write branch switcher lives in the "Sync branch" section of the Settings page.
export const getSettingsBranchSwitcher = () =>
  cy.findByTestId("settings-branch-switcher");

// Open the branch picker on the Settings page (navigates there first).
const openSettingsBranchPicker = () => {
  visitRemoteSyncSettings();
  // The Sync branch section sits below the fold at the default viewport, and Cypress treats an element
  // clipped by a scrollable ancestor as hidden, so scroll to it before asserting visibility.
  getSettingsBranchSwitcher().scrollIntoView().should("be.visible").click();
};

// Create a new branch (forks the current branch and switches to it) via the Settings branch switcher.
export const createBranchViaSettings = (name: string) => {
  openSettingsBranchPicker();
  popover().findByPlaceholderText("Find or create a branch...").type(name);
  popover()
    .findByRole("option", { name: /Create branch/ })
    .click();
};

// Select an existing branch via the Settings branch switcher. With unsaved changes this opens the
// choose-what-to-do modal instead of switching immediately.
export const switchBranchViaSettings = (branch: string) => {
  openSettingsBranchPicker();
  popover().findByPlaceholderText("Find or create a branch...").type(branch);
  popover().findByRole("option", { name: branch }).click();
};

// Enable tenants feature for testing
export const enableTenants = () => {
  cy.request("PUT", "/api/setting/use-tenants", { value: true });
};

// Create a shared tenant collection for testing
// Note: namespace must be "shared-tenant-collection" to match the API query in SharedTenantCollectionsList
export const createSharedTenantCollection = (name: string) => {
  return cy.request("POST", "/api/collection", {
    name,
    namespace: "shared-tenant-collection",
  });
};

// The trailing glob catches the worktree-scoped poll, which carries a `worktree_id` query param.
export const interceptTask = () =>
  cy.intercept("/api/ee/remote-sync/current-task*").as("currentTask");

/**
 * The import/export confirmation modal stays open until the user closes it (GHY-3747). Dismiss it so a
 * subsequent interaction isn't blocked by the modal overlay. Waits for the Close button since the modal
 * renders from the same task poll that `waitForTask` observes.
 */
export const closeSyncResultModal = () => {
  cy.findByTestId("sync-success-close-button", { timeout: 10000 }).click();
};

export const waitForTask = (
  { taskName }: { taskName: "import" | "export" },
  retries = 0,
): Cypress.Chainable => {
  if (retries > 3) {
    throw Error(`Too many retries waiting for ${taskName}`);
  }
  return cy.wait("@currentTask").then(({ response }) => {
    const { body } = response || {};
    if (body?.sync_task_type !== taskName) {
      return waitForTask({ taskName });
    } else if (body?.status !== "successful") {
      return waitForTask({ taskName }, retries + 1);
    }
    // A UI-triggered sync leaves its confirmation modal open; close it so the next step can run.
    return closeSyncResultModal();
  });
};

// Poll for task completion by actively querying the endpoint
// Use this when the app isn't loaded yet (e.g., in setup helpers before cy.visit)
export const pollForTask = (
  { taskName }: { taskName: "import" | "export" },
  retries = 0,
): Cypress.Chainable => {
  if (retries > 30) {
    throw Error(`Too many retries waiting for ${taskName}`);
  }

  return cy
    .request("GET", "/api/ee/remote-sync/current-task")
    .then((response) => {
      const { body } = response;

      // No task exists yet, keep waiting
      if (!body) {
        cy.wait(500);
        return pollForTask({ taskName }, retries + 1);
      }

      // Wrong task type, keep waiting
      if (body.sync_task_type !== taskName) {
        cy.wait(500);
        return pollForTask({ taskName }, retries + 1);
      }

      // Task hasn't completed successfully yet
      if (body.status !== "successful") {
        // Check if it errored
        if (body.status === "errored") {
          throw Error(
            `Task ${taskName} failed: ${body.error_message || "Unknown error"}`,
          );
        }

        if (body.status === "conflict") {
          throw Error(
            `Task ${taskName} returned conflict: ${body.error_message || "Unknown error"}`,
          );
        }

        cy.wait(500);
        return pollForTask({ taskName }, retries + 1);
      }

      // Success!
      return cy.wrap(body);
    });
};
