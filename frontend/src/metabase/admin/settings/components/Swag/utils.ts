export const isSwagEnabled = (version?: string) => {
  if (!version) {
    return false;
  }

  const CUTOFF_DATE = new Date("2024-11-01");
  const versionRegex = /beta/i;

  if (!version.match(versionRegex)) {
    return false;
  }

  if (new Date() < CUTOFF_DATE) {
    return true;
  }

  return false;
};
