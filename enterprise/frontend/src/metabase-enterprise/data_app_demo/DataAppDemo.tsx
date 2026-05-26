import { useEffect, useState } from "react";
import { t } from "ttag";

import { Button, Group, Stack, Text, TextInput, Title } from "metabase/ui";

import { type LoadedDataApp, loadDataAppBundle } from "./loader";

/**
 * Demo host component: fetches the data-app bundle, evaluates it inside the
 * Near-Membrane sandbox (with React and a session-backed `InteractiveQuestion`
 * endowed), and renders the React component the factory returned as a child
 * of Metabase's own React tree.
 *
 * No API key is needed — `sandbox.ts` pre-wraps the SDK component with a
 * pre-initialized SDK Redux store so the SDK's auth handshake is skipped and
 * the host's session cookie authorizes the underlying requests.
 */
export function DataAppDemo() {
  const [app, setApp] = useState<LoadedDataApp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const [questionId, setQuestionId] = useState("1");

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

  const parsedQuestionId = Number.parseInt(questionId, 10);

  return (
    <Stack gap="md" p="md">
      <Title order={4}>{t`Data app PoC`}</Title>
      <Text c="text-secondary">
        {t`Loads a plain-JS bundle from /api/ee/data-app-demo/bundle, evaluates it in a sandbox with React and a session-backed InteractiveQuestion endowed, and renders the returned component.`}
      </Text>

      <Group align="end" gap="sm">
        <TextInput
          label={t`Question ID`}
          value={questionId}
          onChange={(e) => setQuestionId(e.currentTarget.value)}
          w={120}
        />
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
      {app && (
        <app.component
          questionId={Number.isFinite(parsedQuestionId) ? parsedQuestionId : 1}
        />
      )}
    </Stack>
  );
}
