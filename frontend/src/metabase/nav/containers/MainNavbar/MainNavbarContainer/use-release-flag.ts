// Keep the flags short lived
// Mention the team name owner of each flag
type ReleaseFlag = "new-add-data-experience"; // ProductGrowth

export function useReleaseFlag(toggleId: ReleaseFlag) {
  if (window.localStorage.getItem(toggleId)) {
    return true;
  }
  return false;
}
