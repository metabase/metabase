import MetabaseSettings from "metabase/lib/settings";

export function dataAppEdit(appId: string) {
  return `/data-apps/edit/${appId}`;
}

export function dataAppCreate() {
  return `/data-apps/new`;
}

export function publishedDataApp(appUrl: string) {
  const siteUrl = MetabaseSettings.get("site-url");
  return `${siteUrl}/public/data-app/${appUrl}`;
}
