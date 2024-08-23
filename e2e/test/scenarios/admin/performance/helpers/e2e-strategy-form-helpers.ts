import { match } from "ts-pattern";

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

export const openStrategyFormForDatabaseOrDefaultPolicy = (
  /** To open the form for the default policy, set this parameter to "default policy" */
  databaseNameOrDefaultPolicy: string,
  currentStrategyLabel?: string,
) => {
  cy.visit("/admin/performance");
  cy.findByRole("tab", { name: "Database caching settings" }).click();
  cy.log(`Open strategy form for ${databaseNameOrDefaultPolicy}`);

  const clickLauncher = () =>
    formLauncher(
      databaseNameOrDefaultPolicy,
      "currently",
      currentStrategyLabel,
    ).click();

  if (databaseNameOrDefaultPolicy === "default policy") {
    cy.get("body").then($body => {
      if ($body.find('form[data-testid="strategy-form-for-root-0"]').length) {
        // On OSS, the default policy form is open by default, so do nothing
        return;
      } else {
        clickLauncher();
      }
    });
  } else {
    clickLauncher();
  }
};

export const getScheduleComponent = (componentType: ScheduleComponentType) =>
  cacheStrategyForm().findByLabelText(getScheduleComponentLabel(componentType));

export const openSidebar = () => {
  cy.findByLabelText("info icon").click();
};
export const closeSidebar = () => {
  cy.findByLabelText("info icon").click();
};

/** Open the sidebar form that lets you set the caching strategy.
 * This works on dashboards and questions */
export const openSidebarCacheStrategyForm = () => {
  cy.log("Open the cache strategy form in the sidebar");
  openSidebar();
  cy.wait("@getCacheConfig");
  cy.findByLabelText("Caching policy").click();
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
}: SelectCacheStrategyOptions) => {
  log(`Selecting ${strategy.type} strategy for ${item.model}`);
  wrapResult().as("previousResult");

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

  if ("schedule" in strategy && strategy.schedule) {
    if (strategy.schedule !== "0 0 * * * ?") {
      throw new Error(
        `The schedule ${strategy.schedule} is not supported in this test. Only an hourly schedule ("0 0 * * * ?") is supported`,
      );
    }
  }

  saveCacheStrategyForm({ strategyType: strategy.type, model: item?.model });

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
