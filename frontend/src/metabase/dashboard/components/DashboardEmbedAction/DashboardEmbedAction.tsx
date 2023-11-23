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
  if (isAdmin) {
    return isPublicSharingEnabled ? "embed-menu" : "embed-modal";
  }

  if (isPublicSharingEnabled && hasPublicLink) {
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

  const onMenuSelect = (clickBehavior?: EmbedButtonClickBehavior) => {
    setIsOpen(true);
    if (clickBehavior) {
      setClickBehavior(clickBehavior);
    }
  };

  const onClose = () => {
    setIsOpen(false);
    setClickBehavior(initialClickBehavior);
  };

  const targetButton = (
    <DashboardEmbedHeaderButton
      onClick={() => (isOpen ? onClose() : onMenuSelect())}
    />
  );

  const getEmbedContent = (clickBehavior: EmbedButtonClickBehavior) => {
    if (clickBehavior === "embed-menu") {
      return (
        <DashboardEmbedHeaderMenu
          hasPublicLink={hasPublicLink}
          /* TODO: Change to `onMenuSelect("public-link-popover")}` when public link popover is implemented */
          openPublicLinkPopover={() => onClose()}
          openEmbedModal={() => onMenuSelect("embed-modal")}
          target={<div>{targetButton}</div>}
        />
      );
    }
    if (clickBehavior === "embed-modal") {
      return (
        <>
          {targetButton}
          <DashboardSharingEmbeddingModal
            key="dashboard-embed"
            dashboard={dashboard}
            enabled={isOpen}
            onClose={onClose}
            isLinkEnabled={true}
          />
          )
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
