import { match } from "ts-pattern";

import type {
  CacheStrategyType,
  CacheableModel,
  DoNotCacheStrategy,
  InheritStrategy,
} from "metabase-types/api";

import {
  databaseCachingSettingsPage,
  log,
  wrapResult,
} from "./e2e-performance-helpers";
import type { SelectCacheStrategyOptions } from "./types";

/** Save the cache strategy form and wait for a response from the relevant endpoint */
export const saveCacheStrategyForm = (options?: {
  strategyType?: CacheStrategyType;
  /** 'Model' as in 'type of object' */
  model?: CacheableModel;
}) => {
  const expectedRoute = match(options)
    // When the default policy is set to "Don't cache", we delete the policy in the BE
    .with(
      { strategyType: "nocache", model: "root" },
      () => "@deleteCacheConfig",
    )
    // When a database's policy is set to "Use default", we delete the policy in the BE
    .with({ strategyType: "inherit" }, () => "@deleteCacheConfig")
    .otherwise(() => "@putCacheConfig");
  cy.log("Save the cache strategy form");
  cacheStrategyForm().button(/Save/).click();
  return cy.wait(expectedRoute);
};

export const cacheStrategyForm = () =>
  cy.findByLabelText("Select the cache invalidation policy");

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
  databaseCachingSettingsPage().should("exist");
  const regExp = new RegExp(`Edit.*${itemName}.*${preface}.*${strategyLabel}`);
  cy.log(`Finding strategy for launcher for regular expression: ${regExp}`);
  const launcher = databaseCachingSettingsPage().findByLabelText(regExp);
  launcher.should("exist");
  return launcher;
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

export const openSidebar = () => {
  cy.findByLabelText("info icon").click();
};
export const closeSidebar = () => {
  cy.findByLabelText("info icon").click();
};

/** Open the sidebar form that lets you set the caching strategy.
 * This works on dashboards and questions */
export const openSidebarCacheStrategyForm = () => {
  log("Open the cache strategy form in the sidebar");
  openSidebar();
  cy.wait("@getCacheConfig");
  cy.findByLabelText("Caching policy").click();
};

/** Select a cache invalidation strategy for an item.
 * The item can be a question, dashboard, database,
 * or the instance-wide default policy (the "root"). */
export const selectCacheStrategy = ({
  item,
  strategy,
  /** Whether the 'Save changes' button is clicked as part of this operation */
  shouldSaveChanges: saveChanges = true,
  shouldWrapResult = true,
}: SelectCacheStrategyOptions) => {
  log(`Selecting ${strategy.type} strategy for ${item.model}`);
  if (shouldWrapResult) {
    wrapResult().as("previousResult");
  }

  match(item)
    .with({ model: "database" }, ({ name }) => {
      openStrategyFormForDatabaseOrDefaultPolicy(name);
    })
    .with({ model: "root" }, () => {
      openStrategyFormForDatabaseOrDefaultPolicy("default policy");
    })
    .otherwise(() => {
      openSidebarCacheStrategyForm();
    });
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

  if (saveChanges) {
    saveCacheStrategyForm({ strategyType: strategy.type, model: item?.model });
  }

  if (item?.model === "dashboard" || item?.model === "question") {
    closeSidebar();
  }
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

export const openStrategyFormForDatabaseOrDefaultPolicy = (
  /** To open the form for the default policy, set this parameter to "default policy" */
  databaseNameOrDefaultPolicy: string,
  currentStrategyLabel?: string,
) => {
  cy.visit("/admin/performance");
  cy.findByRole("tab", { name: "Database caching settings" }).click();
  cy.log(`Open strategy form for ${databaseNameOrDefaultPolicy}`);
  formLauncher(
    databaseNameOrDefaultPolicy,
    "currently",
    currentStrategyLabel,
  ).click();
};
