/* eslint-disable i18next/no-literal-string */
import dayjs from "dayjs";

import { getEmbeddingSdkVersion } from "embedding-sdk/config";

/**
 * @internal
 */
export const SdkDebugInfo = (props: React.HTMLAttributes<HTMLDivElement>) => {
  const shortCommit = process.env.GIT_COMMIT?.slice(0, 7);

  const buildDate = process.env.BUILD_TIME
    ? new Date(process.env.BUILD_TIME)
    : null;
  const formattedDate = buildDate
    ? dayjs(buildDate).format("YYYY-MM-DD HH:mm")
    : null;
  const timeAgo = buildDate ? dayjs(buildDate).fromNow() : null;

  return (
    <div
      {...props}
      className={`sdk-debug-info mb-wrapper ${props.className}`}
      style={{
        fontSize: "12px",
        textAlign: "left",
        ...props.style,
      }}
    >
      <table>
        <tbody>
          <tr>
            <td>Sdk version:</td>
            <td>
              <b>{getEmbeddingSdkVersion()}</b>
            </td>
          </tr>
          <tr>
            <td>Built at:</td>
            <td>
              {buildDate && (
                <span>
                  {formattedDate} <b>({timeAgo})</b>
                </span>
              )}
            </td>
          </tr>
          <tr>
            <td>From branch:</td>
            <td>
              <b>{process.env.GIT_BRANCH}</b> ({shortCommit})
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};
