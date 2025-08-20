/* eslint-disable i18next/no-literal-string */
import cx from "classnames";
import dayjs from "dayjs";
import type { HTMLAttributes } from "react";

import { getEmbeddingSdkBundleBuildData } from "embedding-sdk/lib/get-embedding-sdk-bundle-build-data";
import {
  EMBEDDING_SDK_PACKAGE_UNKNOWN_VERSION,
  getEmbeddingSdkPackageBuildData,
} from "embedding-sdk/lib/get-embedding-sdk-package-build-data";
import { useSdkSelector } from "embedding-sdk/store";
import { getMetabaseInstanceVersion } from "embedding-sdk/store/selectors";
import type { BuildInfo } from "metabase/embedding-sdk/types/build-info";

import S from "./SdkDebugInfo.module.css";

type BuildTimeData = {
  formattedDate: string;
  timeAgo: string;
} | null;

const getFormattedBuildTimeData = (
  buildTime: string | null | undefined,
): BuildTimeData => {
  if (!buildTime) {
    return null;
  }

  const buildDate = new Date(buildTime);

  return {
    formattedDate: dayjs(buildDate).format("YYYY-MM-DD HH:mm"),
    timeAgo: dayjs(buildDate).fromNow(),
  };
};

type DebugTableProps = {
  titlePrefix: string;
  version: string | null | undefined;
  gitBranch: string | null | undefined;
  gitCommit: string | null | undefined;
  buildTimeData: BuildTimeData;
};

type DebugInfoData = Omit<DebugTableProps, "titlePrefix">;

const getDebugInfoData = (buildInfo: BuildInfo): DebugInfoData => {
  const { version, gitBranch, gitCommit: fullCommit, buildTime } = buildInfo;

  return {
    version,
    gitBranch,
    gitCommit: fullCommit?.slice(0, 7),
    buildTimeData: getFormattedBuildTimeData(buildTime),
  };
};

const DebugTable = ({
  titlePrefix,
  version,
  buildTimeData,
  gitBranch,
  gitCommit,
}: DebugTableProps) => (
  <table>
    <tbody>
      <tr>
        <td>{titlePrefix} version:</td>
        <td>
          <b>{version ?? EMBEDDING_SDK_PACKAGE_UNKNOWN_VERSION}</b>
        </td>
      </tr>

      {buildTimeData && (
        <tr>
          <td>{titlePrefix} built at:</td>
          <td>
            <span>
              {buildTimeData.formattedDate} <b>({buildTimeData.timeAgo})</b>
            </span>
          </td>
        </tr>
      )}

      {(gitBranch || gitCommit) && (
        <tr>
          <td>{titlePrefix} from branch:</td>
          <td>
            <b>{gitBranch}</b> {gitCommit && `(${gitCommit})`}
          </td>
        </tr>
      )}
    </tbody>
  </table>
);

export const SdkDebugInfo = (props: HTMLAttributes<HTMLDivElement>) => {
  const sdkPackageDebugInfoData = getDebugInfoData(
    getEmbeddingSdkPackageBuildData(),
  );

  const sdkBundleVersion = useSdkSelector(getMetabaseInstanceVersion);
  const sdkBundleDebugInfoData = getDebugInfoData(
    getEmbeddingSdkBundleBuildData(sdkBundleVersion ?? undefined),
  );

  return (
    <div
      {...props}
      className={cx("mb-wrapper", S.sdkDebugInfo, props.className)}
      style={props.style}
    >
      <DebugTable titlePrefix="SDK Package" {...sdkPackageDebugInfoData} />
      <DebugTable titlePrefix="SDK Bundle" {...sdkBundleDebugInfoData} />
    </div>
  );
};
