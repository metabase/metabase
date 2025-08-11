import { trackSchemaEvent } from "metabase/lib/analytics";

type UpsellEventProps = {
  location: string;
  campaign: string;
};

export const trackUpsellViewed = ({ location, campaign }: UpsellEventProps) => {
  trackSchemaEvent("upsell", {
    event: "upsell_viewed",
    promoted_feature: campaign,
    upsell_location: location,
  });
};

export const trackUpsellClicked = ({
  location,
  campaign,
}: UpsellEventProps) => {
  trackSchemaEvent("upsell", {
    event: "upsell_clicked",
    promoted_feature: campaign,
    upsell_location: location,
  });
};
