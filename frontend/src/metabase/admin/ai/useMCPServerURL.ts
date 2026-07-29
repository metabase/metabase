import { useAdminSetting } from "metabase/api/utils";

export function useMCPServerURL() {
  const { value: siteUrl } = useAdminSetting("site-url");

  if (!siteUrl) {
    return null;
  }

  return `${siteUrl}/api/metabase-mcp`;
}
