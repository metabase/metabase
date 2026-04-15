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
    // Read-write mode needs manual import trigger
    cy.request("POST", "/api/ee/remote-sync/import", {});
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
    const questionFilePath = (
      syncedCollectionFiles as unknown as string[]
    ).find((file) => file.includes("remote_sync_test_question.yaml"));

    const fullPath = `${LOCAL_GIT_PATH}/${questionFilePath}`;

    cy.readFile(fullPath).then((str) => {
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

// Git sync controls are now in the app bar, not the sidebar
export const getGitSyncControls = () => cy.findByTestId("git-sync-controls");

const ensureGitSyncMenuOpen = () => {
  getGitSyncControls().then(($btn) => {
    if ($btn.attr("data-expanded") !== "true") {
      cy.wrap($btn).click();
    }
  });
};

export const getPullOption = () => {
  ensureGitSyncMenuOpen();
  return popover().findByRole("option", { name: /Pull changes/ });
};

export const getPushOption = () => {
  ensureGitSyncMenuOpen();
  return popover().findByRole("option", { name: /Push changes/ });
};

export const getSwitchBranchOption = () => {
  ensureGitSyncMenuOpen();
  return popover().findByRole("option", { name: /Switch branch/ });
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

export const interceptTask = () =>
  cy.intercept("/api/ee/remote-sync/current-task").as("currentTask");

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
