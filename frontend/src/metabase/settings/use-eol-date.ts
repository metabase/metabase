import { useMemo } from "react";

import { getMajorVersion } from "metabase/utils/version";
import type { VersionInfo } from "metabase-types/api";

import { useGetVersionInfoQuery } from "./api";
import { useSetting } from "./use-setting";

interface UseEolDateResult {
  eolDate: Date | null;
  isEol: boolean;
}

export function useEolDate(): UseEolDateResult {
  const { data: versionInfo } = useGetVersionInfoQuery();
  const version = useSetting("version");

  return useMemo(() => {
    if (!versionInfo || !version.tag) {
      return { eolDate: null, isEol: false };
    }
    const eolDate = getEolDate(versionInfo, version.tag);
    return {
      eolDate,
      isEol: eolDate != null && new Date() > eolDate,
    };
  }, [versionInfo, version.tag]);
}

function getEolDate(versionInfo: VersionInfo, version: string): Date | null {
  const majorVersion = getMajorVersion(version);
  const eol = versionInfo.major_version_support
    ?.filter((support) => support.major === majorVersion)
    .reduce<string | null>(
      (maxEol, { eol }) => (maxEol == null || eol > maxEol ? eol : maxEol),
      null,
    );
  if (!eol) {
    return null;
  }
  const eolDate = new Date(eol);
  if (isNaN(eolDate.valueOf())) {
    return null;
  }
  return eolDate;
}
