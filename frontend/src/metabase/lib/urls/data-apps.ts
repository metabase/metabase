import MetabaseSettings from "metabase/lib/settings";

export function dataAppEdit(appId: string, options: { isNew?: boolean } = {}) {
  const siteUrl = MetabaseSettings.get("site-url");

  const query = options?.isNew
    ? new URLSearchParams({ justCreated: "true" }).toString()
    : "";

  return `${siteUrl}/data-apps/edit/${appId}${query ? "?" + query : ""}`;
}

export function publishedDataApp(appUrl: string) {
  const siteUrl = MetabaseSettings.get("site-url");
  return `${siteUrl}/public/data-app/${appUrl}`;
}
