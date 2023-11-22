import { useState } from "react";
import type { Dashboard } from "metabase-types/api";
import { DashboardEmbedHeaderButton } from "metabase/dashboard/components/DashboardEmbedHeaderButton";
import { DashboardEmbedHeaderMenu } from "metabase/dashboard/components/DashboardEmbedHeaderMenu";
import DashboardSharingEmbeddingModal from "metabase/dashboard/containers/DashboardSharingEmbeddingModal";
import { useSelector } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";
import { getUserIsAdmin } from "metabase/selectors/user";

export type EmbedButtonClickBehavior =
  | "embed-menu"
  | "embed-modal"
  | "public-link-popover"
  | null;

const getClickBehavior = ({
  isAdmin,
  isPublicSharingEnabled,
  hasPublicLink,
}: {
  isAdmin: boolean;
  isPublicSharingEnabled: boolean;
  hasPublicLink: boolean;
}): EmbedButtonClickBehavior => {
  if (!isPublicSharingEnabled) {
    return isAdmin ? "embed-modal" : null;
  }

  if (isAdmin) {
    return "embed-menu";
  }

  if (hasPublicLink) {
    return "public-link-popover";
  }

  return null;
};

export const DashboardEmbedAction = ({
  dashboard,
}: {
  dashboard: Dashboard;
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const isPublicSharingEnabled = useSelector(state =>
    getSetting(state, "enable-public-sharing"),
  );
  const isAdmin = useSelector(getUserIsAdmin);

  const hasPublicLink = !!dashboard.public_uuid;

  const initialClickBehavior: EmbedButtonClickBehavior = getClickBehavior({
    isAdmin,
    isPublicSharingEnabled,
    hasPublicLink,
  });

  const [clickBehavior, setClickBehavior] = useState(initialClickBehavior);

  const onMenuSelect = (clickBehavior: EmbedButtonClickBehavior) => {
    setIsOpen(true);
    setClickBehavior(clickBehavior);
  };

  const onClose = () => {
    setIsOpen(false);
    setClickBehavior(initialClickBehavior);
  };

  const targetButton = (
    <DashboardEmbedHeaderButton onClick={() => setIsOpen(true)} />
  );

  const getEmbedContent = (clickBehavior: EmbedButtonClickBehavior) => {
    if (clickBehavior === "embed-menu") {
      return (
        <DashboardEmbedHeaderMenu
          hasPublicLink={hasPublicLink}
          openPublicLinkPopover={() => onMenuSelect("public-link-popover")}
          openEmbedModal={() => onMenuSelect("embed-modal")}
          target={<div>{targetButton}</div>}
        />
      );
    }
    if (clickBehavior === "embed-modal") {
      return (
        <>
          {targetButton}
          {isOpen && (
            <DashboardSharingEmbeddingModal
              key="dashboard-embed"
              dashboard={dashboard}
              enabled={isOpen}
              onClose={onClose}
              isLinkEnabled={true}
            />
          )}
        </>
      );
    }
    if (clickBehavior === "public-link-popover") {
      // TODO: Add public link popover here.
      return targetButton;
    }

    return null;
  };

  return getEmbedContent(clickBehavior);
};
