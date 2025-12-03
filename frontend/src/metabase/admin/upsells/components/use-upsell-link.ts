import { useUrlWithUtm } from "metabase/common/hooks";

interface UpsellLinkProps {
  /* The URL we're sending them to */
  url: string | undefined;
  /* The name of the feature we're trying to sell */
  campaign: string;
  /* The location, specific component/view of the upsell notification */
  location: string;
}

/**
 * We need to add extra anonymous information to upsell links to know where the user came from
 */
export const useUpsellLink = ({ url, campaign, location }: UpsellLinkProps) => {
  return useUrlWithUtm(url, {
    utm_source: "product",
    utm_medium: "upsell",
    utm_campaign: campaign,
    utm_content: location,
  });
};
