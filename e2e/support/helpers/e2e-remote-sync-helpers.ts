import type { MatcherOptions } from "@testing-library/cypress";
import yamljs from "yamljs";

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

// Copy the sample synced collection from the fixture folder to the working directory
export const copySyncedCollectionFixture = () => {
  cy.task("copyDirectory", {
    source: SYNCED_COLLECTION_FIXTURE_PATH,
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
  syncUrl = LOCAL_GIT_PATH + "/.git",
) {
  cy.request("PUT", "/api/ee/remote-sync/settings", {
    "remote-sync-branch": "main",
    "remote-sync-type": syncType,
    "remote-sync-url": syncUrl,
    "remote-sync-enabled": true,
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
      const doc = yamljs.parse(str);

      assertionsFn?.(doc);

      const updatedDoc = updateFn(doc);

      cy.writeFile(fullPath, yamljs.stringify(updatedDoc));
      cy.exec(`git -C ${LOCAL_GIT_PATH} commit -am '${commitMessage}'`);
    });
  });
};

export const moveCollectionItemToSyncedCollection = (name: string) => {
  navigationSidebar()
    .findByRole("treeitem", { name: /Our analytics/ })
    .click();

  openCollectionItemMenu(name);
  popover().findByText("Move").click();

  entityPickerModal().within(() => {
    cy.findAllByRole("tab", { name: /Browse|Collections/ }).click();
    entityPickerModalItem(1, "Synced Collection").click();
    cy.button("Move").click();
  });

  getSyncStatusIndicators().should("have.length", 1);

  navigationSidebar()
    .findByRole("treeitem", { name: /Synced Collection/ })
    .click();
  collectionTable().findByText(name).should("exist");
};

export const goToSyncedCollection = (opts?: Partial<Cypress.ClickOptions>) =>
  navigationSidebar()
    .findByRole("treeitem", { name: /Synced Collection/ })
    .click(opts);

export const branchPicker = (opts?: Partial<MatcherOptions>) =>
  navigationSidebar().findByTestId("branch-picker-button", opts);

export const interceptTask = () =>
  cy.intercept("/api/ee/remote-sync/current-task").as("currentTask");

export const waitForTask = (
  { taskName }: { taskName: "import" | "export" },
  retries = 0,
) => {
  if (retries > 3) {
    throw Error(`Too many retries waiting for ${taskName}`);
  }
  cy.wait("@currentTask", { timeout: 10000 }).then(({ response }) => {
    const { body } = response;
    if (body.sync_task_type !== taskName) {
      waitForTask({ taskName });
    } else if (body.status !== "successful") {
      waitForTask({ taskName }, retries + 1);
    }
  });
};
