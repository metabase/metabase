import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);

type Props = {
  now: string;
  daysRemaining: number;
  lastDismissed?: string | null;
};

/**
 * Accepts two ISO8601 timestamps and calculates the remaining days until the token expires.
 * The backend returns the token expiry timestamp in UTC format by default!
 */
export function calculateDaysUntilTokenExpiry({
  tokenExpiry,
  currentTime,
}: {
  tokenExpiry: string;
  currentTime: string;
}): number {
  const nowUTC = dayjs.utc(currentTime);
  // Even though the token expiry is in UTC, we treat it using the UTC plugin for consistency.
  // This makes the code bullet-proof in case the backend changes the logic.
  const expiryUTC = dayjs.utc(tokenExpiry);

  return expiryUTC.diff(nowUTC, "days");
}

/**
 * Determines whether a banner should be shown based on the current (ISO8601) timestamp,
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
export function shouldShowBanner({
  now,
  daysRemaining,
  lastDismissed,
}: Props): boolean {
  // No banner if the trial already expired
  if (daysRemaining < 0) {
    return false;
  }

  // Show banner if it was never dismissed
  if (!lastDismissed) {
    return true;
  }

  const nowUTC = dayjs.utc(now);
  const lastDismissedUTC = dayjs.utc(lastDismissed);

  // In the last 3 days, check that the banner was dismissed that day
  if (daysRemaining <= 3) {
    const wasDismissedToday = nowUTC.isSame(lastDismissedUTC, "day");

    return !wasDismissedToday;
  }

  // At this stage, we know it has been dismissed at some point in the past!
  return false;
}
