/* eslint-disable metabase/no-literal-metabase-strings -- This upgrade flow names the product being upgraded. */
import { c, t } from "ttag";

import {
  clearUpgradeSession,
  type useUpgradeStatus,
} from "metabase/status/hooks/self-upgrade";
import { Button, Paper, Stack, Text } from "metabase/ui";
import { getBasename } from "metabase/utils/basename";
import { reload } from "metabase/utils/dom";
import { formatVersion } from "metabase/utils/version";

interface UpgradeCompletionProps {
  status: ReturnType<typeof useUpgradeStatus>;
  inline?: boolean;
}

export function UpgradeCompletion({
  status,
  inline = false,
}: UpgradeCompletionProps) {
  const { hasStatus, phase, newVersion, errorMessage, reset, operation } =
    status;
  if (!hasStatus || (phase !== "done" && phase !== "failed")) {
    return null;
  }
  const displayVersion = formatVersion(newVersion ?? "");
  let message = errorMessage;
  if (phase === "done") {
    message =
      operation === "downgrade"
        ? c("{0} is a version number")
            .t`Metabase was downgraded to ${displayVersion}. Reload the page to use it.`
        : c("{0} is a version number")
            .t`Metabase was updated to ${displayVersion}. Reload the page to use it.`;
  }
  const handleReload = () => {
    clearUpgradeSession();
    reset();
    window.history.replaceState(
      null,
      "",
      `${getBasename()}/admin/settings/updates`,
    );
    reload();
  };

  const content = (
    <Stack
      align="center"
      gap="md"
      onKeyDown={(event) => event.stopPropagation()}
    >
      <Text ta="center" size="md" c={inline ? "inherit" : "text-primary"}>
        {message}
      </Text>
      <Button
        size={inline ? "compact-sm" : "md"}
        onClick={handleReload}
      >{t`Reload the page`}</Button>
    </Stack>
  );

  if (inline) {
    return content;
  }

  return (
    <Paper
      role="status"
      aria-live="polite"
      onKeyDown={(event) => event.stopPropagation()}
      withBorder
      shadow="md"
      p="lg"
    >
      {content}
    </Paper>
  );
}
