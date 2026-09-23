/* eslint-disable metabase/no-literal-metabase-strings -- This upgrade flow names the product being upgraded. */
import { c, t } from "ttag";

import {
  clearUpgradeSession,
  type useUpgradeStatus,
} from "metabase/status/hooks/self-upgrade";
import { Button, Paper, Stack, Text } from "metabase/ui";
import { reload } from "metabase/utils/dom";
import { formatVersion } from "metabase/utils/version";

interface UpgradeCompletionProps {
  status: ReturnType<typeof useUpgradeStatus>;
  compact?: boolean;
}

export function UpgradeCompletion({
  status,
  compact = false,
}: UpgradeCompletionProps) {
  const { hasStatus, phase, newVersion, errorMessage, reset } = status;
  if (!hasStatus || (phase !== "done" && phase !== "failed")) {
    return null;
  }
  const displayVersion = formatVersion(newVersion ?? "");
  const message =
    phase === "done"
      ? c("{0} is a version number")
          .t`Metabase was updated to ${displayVersion}. Reload the page to use it.`
      : errorMessage;
  const handleReload = () => {
    clearUpgradeSession();
    reset();
    window.history.replaceState(null, "", "/");
    reload();
  };

  const content = (
    <Stack
      align={compact ? "flex-start" : "center"}
      gap="md"
      onKeyDown={(event) => event.stopPropagation()}
    >
      <Text
        ta={compact ? "left" : "center"}
        size={compact ? "sm" : "md"}
        c="text-primary"
      >
        {message}
      </Text>
      <Button
        size={compact ? "compact-sm" : "md"}
        onClick={handleReload}
      >{t`Reload the page`}</Button>
    </Stack>
  );

  if (compact) {
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
