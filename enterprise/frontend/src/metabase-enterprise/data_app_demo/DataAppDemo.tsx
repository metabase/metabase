import { useEffect, useState } from "react";
import { t } from "ttag";

import { Button, Group, Stack, Text, Title } from "metabase/ui";

import { type LoadedDataApp, loadDataAppBundle } from "./loader";

/**
 * Demo host component: fetches the data-app bundle, evaluates it inside the
 * Near-Membrane sandbox (with React endowed), and renders the React component
 * the factory returned as a child of Metabase's own React tree.
 *
 * The plugin component is sandbox-realm code; host React invokes it through
 * the membrane each render. Hooks inside the plugin reuse the host's React
 * dispatcher because the plugin sees host React via the endowment.
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
    <Stack gap="md" maw={520}>
      <Title order={4}>{t`Data app PoC`}</Title>
      <Text c="text-secondary">
        {t`Loads a plain-JS bundle from /api/ee/data-app-demo/bundle, evaluates it in a sandbox with React endowed, and renders the returned component.`}
      </Text>

      <Group>
        <Button
          variant="default"
          onClick={() => setVersion((v) => v + 1)}
        >{t`Reload bundle`}</Button>
      </Group>

      {error && (
        <Text c="error">
          {t`Failed to load data app:`} {error}
        </Text>
      )}
      {!app && !error && <Text>{t`Loading bundle…`}</Text>}
      {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- Demo-only greeting passed as a prop to the sandboxed component. */}
      {app && <app.component greeting={t`Hello from Metabase`} />}
    </Stack>
  );
}
