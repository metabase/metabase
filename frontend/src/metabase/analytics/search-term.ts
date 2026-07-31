import Settings from "metabase/utils/settings";

const MB_STATS_ANALYTICS_UUID = "d97541bd-59b0-4656-b437-d659ac48eae1";

export const shouldReportSearchTerm = () =>
  Settings.get("analytics-uuid") === MB_STATS_ANALYTICS_UUID;

export async function hashSearchTerm(searchTerm: string) {
  try {
    const analyticsUuid = Settings.get("analytics-uuid");
    const saltedSearchTerm = searchTerm + "-salt-" + analyticsUuid;

    const dataBuffer = new TextEncoder().encode(saltedSearchTerm);
    const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);

    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch (err) {
    console.warn("Failed to hash search term", err);
    return null;
  }
}
