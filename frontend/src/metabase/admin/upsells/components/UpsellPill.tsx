import { UpsellGem } from "./UpsellGem";
import { UpsellWrapper } from "./UpsellWrapper";
import { UpsellPillComponent } from "./Upsells.styled";
import { useUpsellLink } from "./use-upsell-link";

export function _UpsellPill({
  children,
  link,
  campaign,
  source,
}: {
  children: React.ReactNode;
  link: string;
  campaign: string;
  source: string;
}) {
  const url = useUpsellLink({
    url: link,
    campaign,
    source,
  });

  return (
    <UpsellPillComponent href={url}>
      <UpsellGem />
      {children}
    </UpsellPillComponent>
  );
}

export const UpsellPill = UpsellWrapper(_UpsellPill);
