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
  overlay?: boolean;
}

export function UpgradeCompletion({
  status,
  overlay = false,
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

  return (
    <Paper
      role="status"
      aria-live="polite"
      onKeyDown={(event) => event.stopPropagation()}
      withBorder
      shadow="md"
      p="lg"
      pos={overlay ? "fixed" : undefined}
      top={overlay ? "1rem" : undefined}
      left={overlay ? "1rem" : undefined}
      right={overlay ? "1rem" : undefined}
      style={{ zIndex: 100 }}
    >
      <Stack align="center" gap="md">
        <Text ta="center">{message}</Text>
        <Button onClick={handleReload}>{t`Reload the page`}</Button>
      </Stack>
    </Paper>
  );
}
