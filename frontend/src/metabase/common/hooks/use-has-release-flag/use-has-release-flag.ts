import { useGetReleaseFlagsQuery } from "metabase/api/release-flags";
import type { ReleaseFlag } from "metabase-types/api/release-flag";

export const useHasReleaseFlag = (flag: ReleaseFlag): boolean => {
  const { data: flags } = useGetReleaseFlagsQuery();

  return !!flags?.[flag]?.is_enabled;
};
