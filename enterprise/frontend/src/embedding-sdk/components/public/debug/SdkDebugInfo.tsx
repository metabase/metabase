/* eslint-disable i18next/no-literal-string */
import dayjs from "dayjs";
import type { HTMLAttributes } from "react";

import {
  EMBEDDING_SDK_PACKAGE_UNKNOWN_VERSION,
  getEmbeddingSdkPackageBuildData,
} from "embedding-sdk/lib/get-embedding-sdk-package-build-data";
import { useLazySelector } from "embedding-sdk/sdk-shared/hooks/use-lazy-selector";
import { getMetabaseInstanceVersion } from "embedding-sdk/store/selectors";

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

const useSdkPackageDebugInfo = () => {
  const {
    version,
    buildInfo: { gitBranch, gitCommit: fullCommit, buildTime },
  } = getEmbeddingSdkPackageBuildData();

  return {
    version,
    branch: gitBranch,
    commit: fullCommit?.slice(0, 7),
    buildTimeData: getFormattedBuildTimeData(buildTime),
  };
};

const useSdkBundleDebugInfo = () => {
  const version = useLazySelector(getMetabaseInstanceVersion);

  return {
    version,
    branch: process.env.GIT_BRANCH,
    commit: process.env.GIT_COMMIT?.slice(0, 7),
    buildTimeData: getFormattedBuildTimeData(process.env.BUILD_TIME),
  };
};

interface DebugTableProps {
  titlePrefix: string;
  version: string | null | undefined;
  buildTimeData: BuildTimeData;
  branch?: string | null;
  commit?: string | null;
}

const DebugTable = ({
  titlePrefix,
  version,
  buildTimeData,
  branch,
  commit,
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

      {(branch || commit) && (
        <tr>
          <td>{titlePrefix} from branch:</td>
          <td>
            <b>{branch}</b> {commit && `(${commit})`}
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
      className={`sdk-debug-info mb-wrapper ${props.className ?? ""}`}
      style={{
        display: "flex",
        flexDirection: "column",
        fontSize: "12px",
        textAlign: "left",
        gap: "10px",
        ...props.style,
      }}
    >
      <DebugTable titlePrefix="SDK Package" {...sdkPackageInfo} />
      <DebugTable titlePrefix="SDK Bundle" {...sdkBundleInfo} />
    </div>
  );
};
