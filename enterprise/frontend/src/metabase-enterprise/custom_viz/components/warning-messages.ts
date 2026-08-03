import { match } from "ts-pattern";
import { t } from "ttag";

import type { CustomVizPluginWarning } from "metabase-types/api";

export const SDK_CHANGELOG_URL =
  "https://github.com/metabase/metabase/blob/master/enterprise/frontend/src/custom-viz/CHANGELOG.md";

export function getCustomVizPluginWarningMessage(
  warning: CustomVizPluginWarning,
): string {
  return match(warning)
    .with(
      { type: "sdk-version-mismatch" },
      ({ sdk_version, tested_sdk_range }) =>
        sdk_version
          ? // eslint-disable-next-line metabase/no-literal-metabase-strings -- admin-only custom-viz settings page
            t`Built with SDK version ${sdk_version}, but this version of Metabase was tested with SDK ${tested_sdk_range}.`
          : // eslint-disable-next-line metabase/no-literal-metabase-strings -- admin-only custom-viz settings page
            t`Built with SDK version 1.x, but this version of Metabase was tested with SDK ${tested_sdk_range}.`,
    )
    .with(
      { type: "metabase-version-mismatch" },
      ({ metabase_version, current_version }) =>
        // eslint-disable-next-line metabase/no-literal-metabase-strings -- admin-only custom-viz settings page
        t`Requires Metabase ${metabase_version}, but this instance is on ${current_version}.`,
    )
    .exhaustive();
}
