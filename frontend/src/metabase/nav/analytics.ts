import { trackSchemaEvent } from "metabase/lib/analytics";

type LinkType = "nav" | "help";

export const trackDatabasePromptBannerClicked = (link: LinkType) => {
  trackSchemaEvent("account", "1-0-1", {
    event: "db_connection_banner_click",
    version: "1.0.0",
    link,
  });
};
