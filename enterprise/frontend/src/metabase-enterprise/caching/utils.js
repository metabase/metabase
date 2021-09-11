import { t } from "ttag";
import MetabaseSettings from "metabase/lib/settings";

function msToSeconds(ms) {
  return ms / 1000;
}

/**
 * If a question doesn't have an explicitly set cache TTL,
 * its results can still be cached with a db-level cache TTL
 * or with an instance level setting
 *
 * More on caching:
 * https://www.metabase.com/docs/latest/administration-guide/14-caching.html
 *
 * @param {Question} metabase-lib Question instance
 * @returns {number} — cache TTL value in seconds (from db or instance default) that will be used
 */
export function getQuestionsImplicitCacheTTL(question) {
  if (!MetabaseSettings.get("enable-query-caching")) {
    return null;
  }
  if (question.database().cache_ttl) {
    // Database's cache TTL is in hours, need to convert that to seconds
    return question.database().cache_ttl * 60 * 60;
  }
  const avgQueryDuration = msToSeconds(question.card().average_query_time);
  const minQueryDurationThreshold = MetabaseSettings.get(
    "query-caching-min-ttl",
  );
  const canBeCached = avgQueryDuration > minQueryDurationThreshold;
  if (canBeCached) {
    const cacheTTLMultiplier = MetabaseSettings.get("query-caching-ttl-ratio");
    return avgQueryDuration * cacheTTLMultiplier;
  }
  return null;
}

export function validateCacheTTL(value) {
  if (value === null) {
    return;
  }
  if (!Number.isSafeInteger(value) || value < 0) {
    return t`Must be a positive integer value`;
  }
}

export function normalizeCacheTTL(value) {
  return value === 0 ? null : value;
}
