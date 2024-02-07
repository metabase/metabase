// eslint-disable-next-line no-restricted-imports -- deprecated usage
import type { MomentInput } from "moment-timezone";
// eslint-disable-next-line no-restricted-imports -- deprecated usage
import moment from "moment-timezone";
import { parseTimestamp } from "metabase/lib/time";

export const isWithinWeeks = (
  timestamp: MomentInput,
  weekCount: number,
): boolean => {
  const date = parseTimestamp(timestamp);
  const weeksAgo = moment().subtract(weekCount, "week");
  return date.isAfter(weeksAgo);
};

export const setShowEmbedHomepageFlag = () => {
  try {
    localStorage.setItem("showEmbedHomepage", "true");
  } catch (e) {
    console.error(e);
  }
};

export const removeShowEmbedHomepageFlag = () => {
  try {
    localStorage.removeItem("showEmbedHomepage");
  } catch (e) {
    console.error(e);
  }
};

export const shouldShowEmbedHomepage = () => {
  try {
    return localStorage.getItem("showEmbedHomepage") === "true";
  } catch (e) {
    return false;
  }
};
