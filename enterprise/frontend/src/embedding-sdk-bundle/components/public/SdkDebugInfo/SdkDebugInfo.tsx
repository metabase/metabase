/* eslint-disable i18next/no-literal-string */
import cx from "classnames";
import dayjs from "dayjs";
import type { HTMLAttributes } from "react";

import { getBuildInfo } from "embedding-sdk-shared/lib/get-build-info";
import type { BuildInfo } from "metabase/embedding-sdk/types/build-info";

import S from "./SdkDebugInfo.module.css";
import { sdkDebugInfoSchema } from "./SdkDebugInfo.schema";

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
  gitCommitSha: string | null | undefined;
  buildTimeData: BuildTimeData;
};

type DebugInfoData = Omit<DebugTableProps, "titlePrefix">;

const getDebugInfoData = (buildInfo: BuildInfo): DebugInfoData => {
  const { version, gitBranch, gitCommitSha, buildTime } = buildInfo;

  return {
    version,
    gitBranch,
    gitCommitSha,
    buildTimeData: getFormattedBuildTimeData(buildTime),
  };
};

const DebugTable = ({
  titlePrefix,
  version,
  buildTimeData,
  gitBranch,
  gitCommitSha,
}: DebugTableProps) => (
  <table>
    <tbody>
      <tr>
        <td>{titlePrefix} version:</td>
        <td>
          <b>{version ?? "unknown"}</b>
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

      {(gitBranch || gitCommitSha) && (
        <tr>
          <td>{titlePrefix} from branch:</td>
          <td>
            <b>{gitBranch}</b> {gitCommitSha && `(${gitCommitSha})`}
          </td>
        </tr>
      )}
    </tbody>
  </table>
);

const SdkDebugInfoInner = (props: HTMLAttributes<HTMLDivElement>) => {
  const sdkPackageDebugInfoData = getDebugInfoData(
    getBuildInfo("METABASE_EMBEDDING_SDK_PACKAGE_BUILD_INFO"),
  );

  const sdkBundleDebugInfoData = getDebugInfoData(
    getBuildInfo("METABASE_EMBEDDING_SDK_BUNDLE_BUILD_INFO"),
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

export const SdkDebugInfo = Object.assign(SdkDebugInfoInner, {
  schema: sdkDebugInfoSchema,
});
