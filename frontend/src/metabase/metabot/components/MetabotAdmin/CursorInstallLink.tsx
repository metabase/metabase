import { t } from "ttag";

import { Anchor } from "metabase/ui";

import { useMCPServerURL } from "./utils";

const CURSOR_DEEPLINK = {
  url: "cursor://anysphere.cursor-deeplink/mcp/install",
  // eslint-disable-next-line metabase/no-literal-metabase-strings -- Cursor MCP registration name, not user-facing
  mcpName: "Metabase",
} as const;

const buildCursorInstallUrl = (mcpUrl: string): string => {
  const params = new URLSearchParams({
    name: CURSOR_DEEPLINK.mcpName,
    config: window.btoa(JSON.stringify({ url: mcpUrl })),
  });

  return `${CURSOR_DEEPLINK.url}?${params.toString()}`;
};

export const CursorInstallLink = () => {
  const mcpUrl = useMCPServerURL();

  if (!mcpUrl) {
    return null;
  }

  return (
    <Anchor
      href={buildCursorInstallUrl(mcpUrl)}
      fz="sm"
      w="fit-content"
      onClick={(event) => event.stopPropagation()}
    >
      {t`Install in Cursor`}
    </Anchor>
  );
};
