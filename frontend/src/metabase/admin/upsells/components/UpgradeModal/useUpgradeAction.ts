import { useSetting } from "metabase/common/hooks";

import { useUpsellLink } from "../use-upsell-link";

import { useUpgradeModal } from "./UpgradeModalContext";

interface UseUpgradeActionProps {
  url: string;
  campaign: string;
  location: string;
}

interface UseUpgradeActionResult {
  onClick: (() => void) | undefined;
  url: string | undefined;
}

export function useUpgradeAction({
  url,
  campaign,
  location,
}: UseUpgradeActionProps): UseUpgradeActionResult {
  const isHosted = useSetting("is-hosted?");
  const { openUpgradeModal } = useUpgradeModal();
  const urlWithParams = useUpsellLink({ url, campaign, location });

  if (isHosted) {
    return {
      onClick: openUpgradeModal,
      url: undefined,
    };
  }

  return {
    onClick: undefined,
    url: urlWithParams,
  };
}
