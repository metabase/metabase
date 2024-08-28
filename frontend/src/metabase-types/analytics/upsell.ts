export type UpsellViewedEvent = {
  event: "upsell_viewed";
  promoted_feature: string;
  upsell_location: string;
};

export type UpsellClickedEvent = {
  event: "upsell_clicked";
  promoted_feature: string;
  upsell_location: string;
};

export type UpsellEvent = UpsellViewedEvent | UpsellClickedEvent;
