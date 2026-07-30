import { match } from "ts-pattern";
import { t } from "ttag";

import type { CustomVizPluginWarning } from "metabase-types/api";

export const SDK_CHANGELOG_URL =
  "https://github.com/metabase/metabase/blob/master/enterprise/frontend/src/custom-viz/CHANGELOG.md";

export function getCustomVizPluginWarningMessage(
  warning: CustomVizPluginWarning,
): string {
  return match(warning)
    .with({ type: "sdk-version-mismatch" }, ({ sdk_version }) =>
      sdk_version
        ? // eslint-disable-next-line metabase/no-literal-metabase-strings -- admin-only custom-viz settings page
          t`Built with SDK version ${sdk_version}, which hasn't been tested with this version of Metabase.`
        : // eslint-disable-next-line metabase/no-literal-metabase-strings -- admin-only custom-viz settings page
          t`Built with SDK version 1.x, which hasn't been tested with this version of Metabase.`,
    )
    .with(
      { type: "metabase-version-mismatch" },
      ({ metabase_version, current_version }) =>
        // eslint-disable-next-line metabase/no-literal-metabase-strings -- admin-only custom-viz settings page
        t`Requires Metabase ${metabase_version}, but this instance is on ${current_version}.`,
    )
    .exhaustive();
}
