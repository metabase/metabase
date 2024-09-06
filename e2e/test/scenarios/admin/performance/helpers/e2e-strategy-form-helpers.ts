import { modal, popover } from "e2e/support/helpers";
import {
  type ScheduleComponentType,
  getScheduleComponentLabel,
} from "metabase/components/Schedule/constants";
import type { CacheStrategyType, CacheableModel } from "metabase-types/api";

import { databaseCachingPage } from "./e2e-performance-helpers";

/** Save the cache strategy form and wait for a response from the relevant endpoint */
export const saveCacheStrategyForm = (options?: {
  strategyType?: CacheStrategyType;
  /** 'Model' as in 'type of object' */
  model?: CacheableModel;
}) => {
  let expectedRoute: string;
  if (options?.strategyType === "nocache" && options?.model === "root") {
    // When setting the default policy to "Don't cache", we delete the policy in the BE
    expectedRoute = "@deleteCacheConfig";
  } else if (options?.strategyType === "inherit") {
    // When setting a database's policy to "Use default", we delete the policy in the BE
    expectedRoute = "@deleteCacheConfig";
  } else {
    // Otherwise we update the cache config
    expectedRoute = "@putCacheConfig";
  }
  cy.log("Save the cache strategy form");
  cacheStrategyForm().button(/Save/).click();
  return cy.wait(expectedRoute);
};

export const cacheStrategyForm = () =>
  cy.findByRole("form", { name: "Select the cache invalidation policy" });

export const cacheStrategyRadioButton = (name: RegExp) =>
  cacheStrategyForm().findByRole("radio", { name });

export const durationRadioButton = () => cacheStrategyRadioButton(/Duration/);
export const adaptiveRadioButton = () => cacheStrategyRadioButton(/Adaptive/);
export const scheduleRadioButton = () => cacheStrategyRadioButton(/Schedule/);
export const dontCacheResultsRadioButton = () =>
  cacheStrategyRadioButton(/Don.t cache results/);
export const useDefaultRadioButton = () =>
  cacheStrategyRadioButton(/Use default/);

export const formLauncher = (
  itemName: string,
  preface:
    | "currently"
    | "currently inheriting"
    | "currently inheriting the default policy",
  strategyLabel = "",
) => {
  const regExp = new RegExp(`Edit.*${itemName}.*${preface}.*${strategyLabel}`);
  cy.log(`Finding strategy for launcher for regular expression: ${regExp}`);
  const launcher = databaseCachingPage().findByLabelText(regExp);
  launcher.should("exist");
  return launcher;
};

/** Opens the strategy form on 'Database caching' tab */
export const openStrategyFormForDatabaseOrDefaultPolicy = (
  /** To open the form for the default policy, set this parameter to "default policy" */
  databaseNameOrDefaultPolicy: string,
  currentStrategyLabel?: string,
) => {
  cy.visit("/admin/performance");
  cy.findByRole("tablist").get("[aria-selected]").contains("Database caching");
  cy.log(`Open strategy form for ${databaseNameOrDefaultPolicy}`);
  formLauncher(
    databaseNameOrDefaultPolicy,
    "currently",
    currentStrategyLabel,
  ).click();
};

export const getScheduleComponent = (componentType: ScheduleComponentType) =>
  cacheStrategyForm().findByLabelText(getScheduleComponentLabel(componentType));

export const openSidebar = (type: "question" | "dashboard") => {
  // this will change when we move to having a dashboard settings sidesheet
  if (type === "dashboard") {
    cy.icon("info").click();
    return;
  }

  if (type === "question") {
    cy.findByTestId("qb-header").icon("ellipsis").click();
  }

  popover().findByText("Edit settings").click();
};

export const closeSidebar = () => {
  cy.findByLabelText("Close").click();
};

/** Open the sidebar form that lets you set the caching strategy.
 * This works on dashboards and questions */
export const openSidebarCacheStrategyForm = (
  type: "question" | "dashboard",
) => {
  cy.log("Open the cache strategy form in the sidebar");
  openSidebar(type);
  cy.wait("@getCacheConfig");
  cy.findByLabelText("Caching policy").click();
};

export const cancelConfirmationModal = () => {
  modal().within(() => {
    cy.findByText("Discard your changes?");
    cy.button("Cancel").click();
  });
};
