import { trackSchemaEvent } from "metabase/lib/analytics";

type UpsellEventProps = {
  source: string;
  campaign: string;
};

export const trackUpsellViewed = ({ source, campaign }: UpsellEventProps) => {
  trackSchemaEvent("upsell", "1-0-0", {
    event: "upsell_viewed",
    promoted_feature: campaign,
    upsell_location: source,
  });
};

export const trackUpsellClicked = ({ source, campaign }: UpsellEventProps) => {
  trackSchemaEvent("upsell", "1-0-0", {
    event: "upsell_clicked",
    promoted_feature: campaign,
    upsell_location: source,
  });
};
