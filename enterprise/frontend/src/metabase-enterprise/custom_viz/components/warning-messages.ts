import { match } from "ts-pattern";
import { t } from "ttag";

import type {
  CustomVizPlugin,
  CustomVizPluginWarning,
} from "metabase-types/api";

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
    .with(
      { type: "invalid-identifier" },
      ({ identifier }) =>
        t`The identifier "${identifier}" contains ":", which is no longer allowed, so this visualization isn't served to viewers. Delete it and upload the bundle under a name without ":".`,
    )
    .exhaustive();
}

/**
 * The error to show for a plugin, if any. A `pending` plugin was left behind by an older
 * serdes import that never validated its bundle; nothing resolves that status, so it is
 * presented exactly like an error.
 */
export function getCustomVizPluginErrorMessage(
  plugin: Pick<CustomVizPlugin, "status" | "error_message">,
): string | null {
  if (plugin.status === "pending") {
    return t`This visualization was imported without being validated. Replace its bundle or import it again to activate it.`;
  }

  return plugin.error_message;
}
