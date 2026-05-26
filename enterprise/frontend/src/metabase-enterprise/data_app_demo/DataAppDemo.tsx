import { useEffect, useState } from "react";
import { t } from "ttag";

import { Box, Button, Group, Text } from "metabase/ui";

import { type LoadedDataApp, loadDataAppBundle } from "./loader";

/**
 * Demo host: fetches the data-app bundle, evaluates it inside the Near Membrane
 * sandbox (with React, StaticQuestion and InteractiveQuestion endowed), and
 * renders the React component the factory returned as a child of Metabase's
 * own React tree.
 *
 * The bundle is fully responsible for its own UI now — the host just provides
 * a reload button.
 */
export function DataAppDemo() {
  const [app, setApp] = useState<LoadedDataApp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setApp(null);
    setError(null);
    loadDataAppBundle()
      .then((loaded) => {
        if (!cancelled) {
          setApp(loaded);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [version]);

  return (
    <Box>
      <Group justify="flex-end" p="xs">
        <Button
          size="compact-sm"
          variant="subtle"
          onClick={() => setVersion((v) => v + 1)}
        >{t`Reload bundle`}</Button>
      </Group>

      {error && (
        <Text c="error" p="md">
          {t`Failed to load data app:`} {error}
        </Text>
      )}
      {!app && !error && <Text p="md">{t`Loading bundle…`}</Text>}
      {app && <app.component />}
    </Box>
  );
}
