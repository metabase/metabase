import type { ReactNode } from "react";
import { useState } from "react";

import { useSetting } from "metabase/common/hooks";

import { UPGRADE_URL } from "../../constants";
import { useUpsellLink } from "../use-upsell-link";

import { UpgradeModal } from "./UpgradeModal";

interface UseUpgradeActionProps {
  url: string;
  campaign: string;
  location: string;
}

interface UseUpgradeActionResult {
  onClick: (() => void) | undefined;
  url: string | undefined;
  modal: ReactNode;
}

export function useUpgradeAction({
  url,
  campaign,
  location,
}: UseUpgradeActionProps): UseUpgradeActionResult {
  const isHosted = useSetting("is-hosted?");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const urlWithParams = useUpsellLink({ url, campaign, location });

  const openModal = () => setIsModalOpen(true);
  const closeModal = () => setIsModalOpen(false);

  const shouldUseModal = isHosted && url === UPGRADE_URL;

  const modal = shouldUseModal ? (
    <UpgradeModal opened={isModalOpen} onClose={closeModal} />
  ) : null;

  if (shouldUseModal) {
    return {
      onClick: openModal,
      url: undefined,
      modal,
    };
  }

  return {
    onClick: undefined,
    url: urlWithParams,
    modal,
  };
}
