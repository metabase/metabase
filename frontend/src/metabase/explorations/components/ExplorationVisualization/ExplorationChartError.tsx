import { t } from "ttag";

import { Center, Icon, Stack, Text } from "metabase/ui";
import type { ExplorationQuery } from "metabase-types/api";

import { ExplorationVisualizationHeader } from "./ExplorationVisualizationHeader";

function isPermissionError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error != null &&
    "status" in error &&
    (error as { status?: unknown }).status === 403
  );
}

/**
 * Shown in place of {@link ExplorationChartSkeleton} when an exploration query's
 * result fetch fails. The common case is a 403: the snapshot was computed under
 * its creator's data-access lens (sandboxing/impersonation/routing) and the
 * current viewer's lens differs, so they cannot see these results — surface a
 * permission message instead of looping on the loading skeleton forever.
 */
export function ExplorationChartError({
  name,
  explorationQuery,
  error,
}: {
  name: string | null;
  explorationQuery?: ExplorationQuery;
  error: unknown;
}) {
  const permission = isPermissionError(error);
  return (
    <>
      <ExplorationVisualizationHeader
        name={name ?? ""}
        explorationQuery={explorationQuery}
      />
      <Center h="100%" p="md">
        <Stack align="center" gap="sm" maw="20rem">
          <Icon
            name={permission ? "lock" : "warning"}
            size={24}
            c={permission ? "text-secondary" : "error"}
          />
          <Text c="text-secondary" ta="center">
            {permission
              ? t`You don't have permission to view these results.`
              : t`This chart couldn't be loaded.`}
          </Text>
        </Stack>
      </Center>
    </>
  );
}
