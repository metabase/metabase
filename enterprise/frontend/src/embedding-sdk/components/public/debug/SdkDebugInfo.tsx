/* eslint-disable i18next/no-literal-string */
import cx from "classnames";
import dayjs from "dayjs";
import type { HTMLAttributes } from "react";

import {
  EMBEDDING_SDK_PACKAGE_UNKNOWN_VERSION,
  getEmbeddingSdkPackageBuildData,
} from "embedding-sdk/lib/get-embedding-sdk-package-build-data";
import { useLazySelector } from "embedding-sdk/sdk-shared/hooks/use-lazy-selector";
import { getMetabaseInstanceVersion } from "embedding-sdk/store/selectors";

import Styles from "./SdkDebugInfo.module.css";

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

const useSdkPackageDebugInfo = (): DebugInfoData => {
  const {
    version,
    gitBranch,
    gitCommit: fullCommit,
    buildTime,
  } = getEmbeddingSdkPackageBuildData() ?? {};

  return {
    version,
    gitBranch,
    gitCommit: fullCommit?.slice(0, 7),
    buildTimeData: getFormattedBuildTimeData(buildTime),
  };
};

const useSdkBundleDebugInfo = (): DebugInfoData => {
  const version = useLazySelector(getMetabaseInstanceVersion);

  return {
    version,
    gitBranch: process.env.GIT_BRANCH,
    gitCommit: process.env.GIT_COMMIT?.slice(0, 7),
    buildTimeData: getFormattedBuildTimeData(process.env.BUILD_TIME),
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
  const sdkPackageInfo = useSdkPackageDebugInfo();
  const sdkBundleInfo = useSdkBundleDebugInfo();

  return (
    <div
      {...props}
      className={cx("mb-wrapper", Styles.sdkDebugInfo, props.className)}
      style={props.style}
    >
      <DebugTable titlePrefix="SDK Package" {...sdkPackageInfo} />
      <DebugTable titlePrefix="SDK Bundle" {...sdkBundleInfo} />
    </div>
  );
};
