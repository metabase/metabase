type UpsellEventSchema = {
  event: string;
  promoted_feature?: string | null;
  upsell_location?: string | null;
};

type ValidateEvent<
  T extends UpsellEventSchema &
    Record<Exclude<keyof T, keyof UpsellEventSchema>, never>,
> = T;

export type UpsellViewedEvent = ValidateEvent<{
  event: "upsell_viewed";
  promoted_feature: string;
  upsell_location: string;
}>;

export type UpsellClickedEvent = ValidateEvent<{
  event: "upsell_clicked";
  promoted_feature: string;
  upsell_location: string;
}>;

export type UpsellEvent = UpsellViewedEvent | UpsellClickedEvent;
