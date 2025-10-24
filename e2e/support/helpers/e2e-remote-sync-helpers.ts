import yamljs from "yamljs";

import type { Collection } from "metabase-types/api";

import { openCollectionItemMenu } from "./e2e-collection-helpers";
import {
  entityPickerModal,
  entityPickerModalItem,
  entityPickerModalTab,
  navigationSidebar,
  popover,
} from "./e2e-ui-elements-helpers";

export const LOCAL_GIT_PATH =
  Cypress.config("projectRoot") + "/e2e/tmp/test-repo";
export const LIBRARY_FIXTURE_PATH =
  Cypress.config("projectRoot") + "/e2e/support/assets/example_library";

// Copy the sample library from the fixture folder to the working directory
export const copyLibraryFixture = () => {
  cy.task("copyDirectory", {
    source: LIBRARY_FIXTURE_PATH,
    destination: LOCAL_GIT_PATH,
  });
};

export const checkoutLibraryBranch = (branch: string) => {
  cy.exec("git -C " + LOCAL_GIT_PATH + ` checkout -b  '${branch}'`);
};

export const commitToLibrary = (message = "Adding content to library") => {
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
  syncType: "development" | "production",
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
export const wrapLibraryFiles = (alias = "libraryFiles") => {
  stashChanges();
  cy.task("readDirectory", LOCAL_GIT_PATH).then((files) => {
    cy.wrap(
      (files as string[]).filter(
        (file: string) => !file.includes(".git") && file.includes(".yaml"),
      ),
    ).as(alias);
  });
};

// Wraps the library collection for use in tests
export const wrapLibraryCollection = (alias = "library", n = 0) => {
  if (n > 3) {
    throw new Error("Could not find library collection");
  }

  cy.request("/api/collection").then(({ body: collections }) => {
    const libraryCollection = collections.find(
      (c: Collection) => c.type === "remote-synced" && c.location === "/",
    );

    if (libraryCollection) {
      cy.wrap(libraryCollection).as(alias);
    } else {
      cy.wait(500);
      wrapLibraryCollection(alias, n + 1);
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
  wrapLibraryFiles();
  cy.get("@libraryFiles").then((libraryFiles) => {
    const questionFilePath = (libraryFiles as unknown as string[]).find(
      (file) => file.includes("remote_sync_test_question.yaml"),
    );

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

export const moveCollectionItemToLibrary = (name: string) => {
  openCollectionItemMenu(name);
  popover().findByText("Move").click();

  entityPickerModal().within(() => {
    entityPickerModalTab("Browse").click();
    entityPickerModalItem(1, "Library").click();
    cy.button("Move").click();
  });
};
