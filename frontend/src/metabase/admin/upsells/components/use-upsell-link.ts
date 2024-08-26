import { useSetting } from "metabase/common/hooks";
import { getPlan } from "metabase/common/utils/plan";

interface UpsellLinkProps {
  /* The URL we're sending them to */
  url: string;
  /* The name of the feature we're trying to sell */
  campaign: string;
  /* The source component/view of the upsell notification */
  source: string;
}

/**
 * We need to add extra anonymous information to upsell links to know where the user came from
 */
export const useUpsellLink = ({ url, campaign, source }: UpsellLinkProps) => {
  const plan = getPlan(useSetting("token-features"));

  return `${url}?utm_source=product&utm_medium=upsell&utm_campaign=${campaign}&utm_content=${source}&source_plan=${plan}`;
};
