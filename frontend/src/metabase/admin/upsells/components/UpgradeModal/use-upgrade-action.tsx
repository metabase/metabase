import { useCallback } from "react";

import { useSetting } from "metabase/common/hooks";
import { useDispatch } from "metabase/lib/redux";
import { setOpenModal } from "metabase/redux/ui";

import { DATA_STUDIO_UPGRADE_URL, UPGRADE_URL } from "../../constants";
import { useUpsellLink } from "../use-upsell-link";

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
  const dispatch = useDispatch();
  const isHosted = useSetting("is-hosted?");
  const urlWithParams = useUpsellLink({ url, campaign, location });

  const openModal = useCallback(() => {
    dispatch(setOpenModal("upgrade"));
  }, [dispatch]);

  const shouldUseModal =
    isHosted && (url === UPGRADE_URL || url === DATA_STUDIO_UPGRADE_URL);

  if (shouldUseModal) {
    return {
      onClick: openModal,
      url: undefined,
    };
  }

  return {
    onClick: undefined,
    url: urlWithParams,
  };
}
