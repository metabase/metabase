import { useEffect, useState } from "react";
import { t } from "ttag";

import { useAdminSetting } from "metabase/api/utils";
import { Box, Button, Group, Text, TextInput } from "metabase/ui";

import { type LoadedDataApp, loadDataAppBundle } from "./loader";

const DEV_URL_SETTING = "data-app-demo-dev-bundle-url";

/**
 * Demo host: fetches the data-app bundle, evaluates it inside the Near
 * Membrane sandbox (with React, StaticQuestion and InteractiveQuestion
 * endowed), and renders the React component the factory returned as a child
 * of Metabase's own React tree.
 *
 * Bundle source is controlled by the `data-app-demo-dev-bundle-url` admin
 * setting. When set, Metabase proxies that URL each fetch (typical dev
 * workflow: ngrok in front of the agent's local `public/index.js`). When
 * unset, the built-in classpath resource is served.
 */
export function DataAppDemo() {
  const [app, setApp] = useState<LoadedDataApp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const { value: settingUrl, updateSetting } = useAdminSetting(DEV_URL_SETTING);
  const [urlDraft, setUrlDraft] = useState<string>(settingUrl ?? "");
  useEffect(() => {
    setUrlDraft(settingUrl ?? "");
  }, [settingUrl]);

  const handleSaveUrl = async () => {
    const trimmed = urlDraft.trim();
    await updateSetting({
      key: DEV_URL_SETTING,
      value: trimmed === "" ? null : trimmed,
    });
    setVersion((v) => v + 1);
  };

  const handleClearUrl = async () => {
    setUrlDraft("");
    await updateSetting({ key: DEV_URL_SETTING, value: null });
    setVersion((v) => v + 1);
  };

  const hasUrl = (settingUrl ?? "").trim().length > 0;

  useEffect(() => {
    let cancelled = false;
    setApp(null);
    setError(null);
    if (!hasUrl) {
      return;
    }
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
  }, [version, hasUrl]);

  return (
    <Box>
      <Group p="xs" gap="sm" align="end">
        <TextInput
          label={t`Dev bundle URL`}
          // eslint-disable-next-line metabase/no-literal-metabase-strings -- Admin-only PoC page; mentions the host product by name in dev guidance.
          description={t`When set, Metabase proxies the bundle from this URL on each render. Leave blank to use the built-in resource bundle.`}
          placeholder="https://abc-xyz.ngrok-free.app"
          value={urlDraft}
          onChange={(e) => setUrlDraft(e.currentTarget.value)}
          style={{ flex: 1 }}
        />
        <Button size="compact-sm" onClick={handleSaveUrl}>{t`Save`}</Button>
        <Button
          size="compact-sm"
          variant="subtle"
          onClick={handleClearUrl}
        >{t`Clear`}</Button>
        <Button
          size="compact-sm"
          variant="subtle"
          onClick={() => setVersion((v) => v + 1)}
        >{t`Reload bundle`}</Button>
      </Group>

      {!hasUrl && (
        <Text c="text-secondary" p="md">
          {t`Paste a dev bundle URL above and click Save to render a data app.`}
        </Text>
      )}
      {hasUrl && error && (
        <Text c="error" p="md">
          {t`Failed to load data app:`} {error}
        </Text>
      )}
      {hasUrl && !app && !error && <Text p="md">{t`Loading bundle…`}</Text>}
      {hasUrl && app && <app.component />}
    </Box>
  );
}
