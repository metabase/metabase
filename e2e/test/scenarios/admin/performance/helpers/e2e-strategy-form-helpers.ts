import { match } from "ts-pattern";

import { modal, popover } from "e2e/support/helpers";
import {
  type ScheduleComponentType,
  getScheduleComponentLabel,
} from "metabase/components/Schedule/constants";
import type {
  CacheStrategyType,
  CacheableModel,
  DoNotCacheStrategy,
  InheritStrategy,
} from "metabase-types/api";

import { databaseCachingPage, log } from "./e2e-performance-helpers";
import type { SelectCacheStrategyOptions, StrategyBearer } from "./types";

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

export const preemptiveCachingSwitch = () =>
  cy.findByTestId("preemptive-caching-switch");
export const enablePreemptiveCaching = () =>
  preemptiveCachingSwitch().within(() => {
    cy.findByRole("switch").should("not.be.checked");
    cy.findByRole("switch").next("label").click();
    cy.findByRole("switch").should("be.checked");
  });
export const disablePreemptiveCaching = () =>
  preemptiveCachingSwitch().within(() => {
    cy.findByRole("switch").should("be.checked");
    cy.findByRole("switch").next("label").click();
    cy.findByRole("switch").should("not.be.checked");
  });
export const checkPreemptiveCachingEnabled = () =>
  preemptiveCachingSwitch().within(() => {
    cy.findByRole("switch").should("be.checked");
  });
export const checkPreemptiveCachingDisabled = () =>
  preemptiveCachingSwitch().within(() => {
    cy.findByRole("switch").should("not.be.checked");
  });

export const dashboardAndQuestionsTable = () =>
  cy.findByRole("table", {
    name: /Here are the dashboards and questions/,
  });

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
  if (type === "dashboard") {
    cy.findByTestId("dashboard-header").icon("ellipsis").click();
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
  cy.findByLabelText("When to get new results").click();
  return cacheStrategySidesheet();
};

export const cacheStrategySidesheet = () =>
  cy.findByRole("dialog", { name: /Caching settings/ }).should("be.visible");

export const questionSettingsSidesheet = () =>
  cy.findByRole("dialog", { name: /Question settings/ }).should("be.visible");

export const cancelConfirmationModal = () => {
  modal().within(() => {
    cy.findByText("Discard your changes?");
    cy.button("Cancel").click();
  });
};

export const getRadioButtonForStrategyType = (
  strategyType: CacheStrategyType,
) =>
  match(strategyType)
    .with("duration", () => durationRadioButton())
    .with("ttl", () => adaptiveRadioButton())
    .with("schedule", () => scheduleRadioButton())
    .with("inherit", () => useDefaultRadioButton())
    .with("nocache", () => dontCacheResultsRadioButton())
    .exhaustive();

/** Select a cache invalidation strategy for an item.
 * The item can be a question, dashboard, database,
 * or the instance-wide default policy (the "root"). */
export const selectCacheStrategy = ({
  item,
  strategy,
  oss = false,
}: SelectCacheStrategyOptions) => {
  log(`Selecting ${strategy.type} strategy for ${item.model}`);

  // On OSS, you can only set the root policy, so there's no need to open a
  // specific strategy form
  if (oss) {
    cy.visit("/admin/performance");
    cacheStrategyForm();
  } else {
    openStrategyFormFor(item);
  }

  getRadioButtonForStrategyType(strategy.type).click();

  if ("multiplier" in strategy && strategy.multiplier) {
    cy.findByLabelText(/Multiplier/).type(`${strategy.multiplier}`);
  }

  if ("min_duration_ms" in strategy && strategy.min_duration_ms) {
    cy.findByLabelText(/Minimum query duration/).type(
      `${strategy.min_duration_ms / 1000}`,
    );
  }

  if ("duration" in strategy && strategy.duration) {
    cy.findByLabelText("Cache results for this many hours").type(
      `${strategy.duration}`,
    );
  }

  if ("schedule" in strategy && strategy.schedule) {
    if (strategy.schedule !== "0 0 * * * ?") {
      throw new Error(
        `The schedule ${strategy.schedule} is not supported in this test. Only an hourly schedule ("0 0 * * * ?") is supported`,
      );
    }
  }

  saveCacheStrategyForm({ strategyType: strategy.type, model: item?.model });
};

export const disableCaching = (
  options: Omit<SelectCacheStrategyOptions<DoNotCacheStrategy>, "strategy">,
) =>
  selectCacheStrategy({
    ...options,
    strategy: { type: "nocache" },
  });

/** Set the cache invalidation strategy to 'Use default' */
export const useDefaultCacheStrategy = (
  options: Omit<SelectCacheStrategyOptions<InheritStrategy>, "strategy">,
) =>
  selectCacheStrategy({
    ...options,
    strategy: { type: "inherit" },
  });

const openStrategyFormFor = (item: StrategyBearer) => {
  return match(item)
    .with({ model: "database" }, ({ name }) => {
      openStrategyFormForDatabaseOrDefaultPolicy(name);
    })
    .with({ model: "root" }, () => {
      openStrategyFormForDatabaseOrDefaultPolicy("default policy");
    })
    .with({ model: "question" }, () => {
      openSidebarCacheStrategyForm("question");
    })
    .with({ model: "dashboard" }, () => {
      openSidebarCacheStrategyForm("dashboard");
    })
    .exhaustive();
};
