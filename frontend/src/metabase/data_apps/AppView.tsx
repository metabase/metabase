import { useEffect, useState } from "react";
import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Box, Text } from "metabase/ui";
import { useGetDataAppQuery } from "metabase/api";

import { type LoadedDataApp, loadDataAppBundle } from "./loader";

interface AppViewProps {
  params: { name: string };
}

/**
 * /app/:name — fetch the data-app's metadata and JS bundle by name, evaluate
 * the bundle in a Near Membrane sandbox, and render the returned component
 * inside the host React tree.
 */
export function AppView({ params }: AppViewProps) {
  const name = params.name;
  const validName = typeof name === "string" && name.length > 0;

  const {
    data: meta,
    isLoading: metaLoading,
    error: metaError,
  } = useGetDataAppQuery(name, { skip: !validName });

  const [app, setApp] = useState<LoadedDataApp | null>(null);
  const [bundleError, setBundleError] = useState<string | null>(null);

  useEffect(() => {
    if (!validName || !meta) {
      return;
    }
    let cancelled = false;
    setApp(null);
    setBundleError(null);
    loadDataAppBundle(name, meta.id)
      .then((loaded) => {
        if (!cancelled) {
          setApp(loaded);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setBundleError(e instanceof Error ? e.message : String(e));
        }
      });
    return () => {
      cancelled = true;
    };
    // meta.bundle_hash changes on re-upload → re-fetch.
  }, [name, validName, meta?.bundle_hash, meta]);

  if (!validName) {
    return (
      <Box p="md">
        <Text c="error">{t`Invalid data app name.`}</Text>
      </Box>
    );
  }

  if (metaLoading || (!meta && !metaError)) {
    return <LoadingAndErrorWrapper loading />;
  }

  if (metaError || !meta) {
    return (
      <Box p="md">
        <Text c="error">{t`Data app not found.`}</Text>
      </Box>
    );
  }

  return (
    <Box>
      {bundleError && (
        <Text c="error" p="md">
          {t`Failed to load data app:`} {bundleError}
        </Text>
      )}
      {!app && !bundleError && <Text p="md">{t`Loading bundle…`}</Text>}
      {app && <app.component />}
    </Box>
  );
}
