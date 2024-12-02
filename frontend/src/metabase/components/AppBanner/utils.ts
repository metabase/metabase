import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);

type Props = {
  daysRemaining: number;
  lastDismissed?: string | null;
  tokenExpiryTimestamp: string;
};

/**
 * Determines whether a banner should be shown based on the token expiry (ISO8601) timestamp,
 * the number of days remaining in a trial period, and the last dismissal (ISO8601) timestamp.
 *
 * The banner will not be shown if:
 * - The token has expired.
 * - The banner was never dismissed (i.e., `lastDismissed` is null) or
 * - The banner dismissal information is not available (i.e., `lastDismissed` is undefined).
 *
 * If the trial is within the last 3 days, the function checks if the banner
 * was dismissed on the current day. Unless it was dismissed on that day,
 * the banner will be shown to the user.
 *
 * If the trial has more than 3 days remaining, the banner will be shown only if
 * the user has never dismissed it.
 */
export function shouldShowTrialBanner({
  daysRemaining,
  lastDismissed,
  tokenExpiryTimestamp,
}: Props): boolean {
  // No banner if the trial already expired
  if (daysRemaining < 0) {
    return false;
  }

  // Show banner if it was never dismissed
  if (!lastDismissed) {
    return true;
  }

  // In the last 3 days, check that the banner was dismissed that day
  if (daysRemaining <= 3) {
    const today = dayjs(tokenExpiryTimestamp).subtract(daysRemaining, "days");
    const wasDismissedToday = today.isSame(lastDismissed, "day");

    return !wasDismissedToday;
  }

  // At this stage, we know it has been dismissed at some point in the past!
  return false;
}

export const getCurrentUTCTimestamp = () => {
  return dayjs.utc().toISOString();
};
