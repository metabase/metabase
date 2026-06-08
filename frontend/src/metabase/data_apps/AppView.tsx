import { t } from "ttag";

import { useGetDataAppQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Box, Text } from "metabase/ui";
import { getSubpathSafeUrl } from "metabase/urls";

interface AppViewProps {
  params: { name: string };
}

/**
 * /app/:name — renders the requested data-app inside an isolated iframe.
 *
 * The iframe loads a real BE-served route (`/embed/data-app/:name`) that
 * returns `data-app.html` — a stand-alone HTML shell that boots its own
 * React app (`app-data-app.tsx`). That iframe-side app fetches the bundle,
 * sandboxes it via Near Membrane bound to the iframe window, and renders
 * the resulting component.
 *
 * Isolation: `data-app.html` links only the narrow `data-app-vendors.css`
 * (Mantine + SDK essentials), NOT Metabase's `index.module.css`. Same-origin
 * frame, so cookie-based session auth still works.
 *
 * Parent's only responsibilities here are: validate the name, fetch the
 * metadata for the title, and render the `<iframe>`.
 */
export function AppView({ params }: AppViewProps) {
  const name = params.name;
  const validName = typeof name === "string" && name.length > 0;

  const {
    data: meta,
    isLoading: metaLoading,
    error: metaError,
  } = useGetDataAppQuery(name, { skip: !validName });

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

  const src = getSubpathSafeUrl(
    `/embed/data-app/${encodeURIComponent(name)}`,
  );

  return (
    <Box style={{ height: "100%", minHeight: "100vh" }}>
      <iframe
        title={meta.display_name}
        src={src}
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          minHeight: "100vh",
          border: 0,
        }}
      />
    </Box>
  );
}
