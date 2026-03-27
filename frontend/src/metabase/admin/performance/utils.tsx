import { match } from "ts-pattern";
import { c } from "ttag";
import type { SchemaObjectDescription } from "yup/lib/schema";

import { cronToScheduleSettings } from "metabase/common/components/Schedule/cron";
import { getScheduleStrings } from "metabase/common/components/Schedule/strings";
import { PLUGIN_CACHING } from "metabase/plugins";
import { isNullOrUndefined } from "metabase/utils/types";
import type {
  AdaptiveStrategy,
  CacheConfig,
  CacheStrategy,
  CacheStrategyType,
  CacheableModel,
} from "metabase-types/api";

import { defaultMinDurationMs, rootId } from "./constants/simple";
import type { PerformanceTabId, StrategyData, StrategyLabel } from "./types";

type ErrorWithMessage = { data: { message: string } };
export const isErrorWithMessage = (error: unknown): error is ErrorWithMessage =>
  typeof error === "object" &&
  error !== null &&
  "data" in error &&
  typeof (error as { data: any }).data === "object" &&
  "message" in (error as { data: any }).data &&
  typeof (error as { data: { message: any } }).data.message === "string";

const delay = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

/** To prevent UI jumpiness, ensure a minimum delay before continuing.
 * An example of jumpiness: clicking a save button results in
 * displaying a loading spinner for 10 ms and then a success message */
export const resolveSmoothly = async (
  promises: Promise<any>[],
  timeout: number = 300,
) => {
  return await Promise.all([delay(timeout), ...promises]);
};

export const getFrequencyFromCron = (cron: string) => {
  const scheduleType = cronToScheduleSettings(cron)?.schedule_type;
  const { scheduleOptionNames } = getScheduleStrings();
  return isNullOrUndefined(scheduleType)
    ? ""
    : scheduleOptionNames[scheduleType];
};

export const isValidStrategyName = (
  strategy: string,
): strategy is CacheStrategyType => {
  const { strategies } = PLUGIN_CACHING;
  const validStrategyNames = new Set(Object.keys(strategies));
  return validStrategyNames.has(strategy);
};

export const getLabelString = (label: StrategyLabel, model?: CacheableModel) =>
  typeof label === "string" ? label : label(model);

export const getShortStrategyLabel = (
  strategy?: CacheStrategy,
  model?: CacheableModel,
) => {
  const { strategies } = PLUGIN_CACHING;
  if (!strategy) {
    return null;
  }
  const type = strategies[strategy.type];
  const mainLabel = getLabelString(type.shortLabel ?? type.label, model);
  /** Part of the label shown after the colon */
  const subLabel = match(strategy)
    .with({ type: "schedule" }, (strategy) =>
      getFrequencyFromCron(strategy.schedule),
    )
    .with(
      { type: "duration" },
      (strategy) =>
        c(
          "{0} is a number. Indicates a number of hours (the length of a cache)",
        ).t`${strategy.duration}h`,
    )
    .otherwise(() => null);
  if (subLabel) {
    return c(
      "{0} is the primary label for a cache invalidation strategy. {1} is a further description.",
    ).t`${mainLabel}: ${subLabel}`;
  } else {
    return mainLabel;
  }
};

export const getStrategyValidationSchema = (strategyData: StrategyData) => {
  if (typeof strategyData.validationSchema === "function") {
    return strategyData.validationSchema();
  } else {
    return strategyData.validationSchema;
  }
};

export const getFieldsForStrategyType = (strategyType: CacheStrategyType) => {
  const { strategies } = PLUGIN_CACHING;
  const strategyData = strategies[strategyType];
  const validationSchemaDescription = getStrategyValidationSchema(
    strategyData,
  ).describe() as SchemaObjectDescription;
  const fieldRecord = validationSchemaDescription.fields;
  const fields = Object.keys(fieldRecord);
  return fields;
};

export const translateConfig = <T extends CacheConfig>(
  config: T,
  direction: "fromAPI" | "toAPI",
): T => {
  const translated = { ...config, strategy: { ...config.strategy } } as T;

  // If strategy type is unsupported, use a fallback
  if (!isValidStrategyName(translated.strategy.type)) {
    translated.strategy.type =
      translated.model_id === rootId ? "nocache" : "inherit";
  }

  if (translated.strategy.type === "ttl") {
    if (direction === "fromAPI") {
      translated.strategy = populateMinDurationSeconds(translated.strategy);
    } else {
      translated.strategy.min_duration_ms =
        translated.strategy.min_duration_seconds === undefined
          ? defaultMinDurationMs
          : translated.strategy.min_duration_seconds * 1000;
      delete translated.strategy.min_duration_seconds;
    }
  }
  return translated;
};

export const populateMinDurationSeconds = (strategy: AdaptiveStrategy) => ({
  ...strategy,
  min_duration_seconds: Math.ceil(strategy.min_duration_ms / 1000),
});

/** Translate a config from the API into a format the frontend can use */
export const translateConfigFromAPI = <T extends CacheConfig>(config: T): T =>
  translateConfig(config, "fromAPI");

/** Translate a config from the frontend's format into the API's preferred format */
export const translateConfigToAPI = <T extends CacheConfig>(config: T): T =>
  translateConfig(config, "toAPI");

export const getPerformanceTabName = (tabId: PerformanceTabId) =>
  PLUGIN_CACHING.getTabMetadata().find(
    ({ key }) => key === `performance-${tabId}`,
  )?.name;

export const getDefaultValueForField = (
  strategyType: CacheStrategyType,
  fieldName?: string,
) => {
  const schema = getStrategyValidationSchema(
    PLUGIN_CACHING.strategies[strategyType],
  );
  return fieldName ? schema.cast({})[fieldName] : "";
};
