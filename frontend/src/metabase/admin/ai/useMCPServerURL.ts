import { useAdminSetting } from "metabase/settings";

export function useMCPServerURL() {
  const { value: siteUrl } = useAdminSetting("site-url");

  if (!siteUrl) {
    return null;
  }

  return `${siteUrl}/api/metabase-mcp`;
}
