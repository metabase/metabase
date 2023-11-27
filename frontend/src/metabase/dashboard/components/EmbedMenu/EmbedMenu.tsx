import { useState } from "react";
import type { Dashboard } from "metabase-types/api";
import {
  DashboardPublicLinkPopover,
  QuestionPublicLinkPopover,
} from "metabase/dashboard/components/PublicLinkPopover";
import { DashboardEmbedHeaderButton } from "metabase/dashboard/components/DashboardEmbedHeaderButton";
import { DashboardEmbedHeaderMenu } from "metabase/dashboard/components/DashboardEmbedHeaderMenu";
import { useSelector } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";
import { getUserIsAdmin } from "metabase/selectors/user";
import type Question from "metabase-lib/Question";

export type EmbedMenuModes =
  | "embed-menu"
  | "embed-modal"
  | "public-link-popover"
  | null;

type ResourceType =
  | {
      resource: Dashboard;
      resourceType: "dashboard";
    }
  | {
      resource: Question;
      resourceType: "question";
    };

const getEmbedMenuMode = ({
  isAdmin,
  isPublicSharingEnabled,
  hasPublicLink,
}: {
  isAdmin: boolean;
  isPublicSharingEnabled: boolean;
  hasPublicLink: boolean;
}): EmbedMenuModes => {
  if (isAdmin) {
    return isPublicSharingEnabled ? "embed-menu" : "embed-modal";
  }

  if (isPublicSharingEnabled && hasPublicLink) {
    return "public-link-popover";
  }

  return null;
};

export const EmbedMenu = ({
  resource,
  resourceType,
  hasPublicLink,
  onModalOpen,
  onModalClose,
}: ResourceType & {
  hasPublicLink: boolean;
  onModalOpen?: () => void;
  onModalClose?: () => void;
}) => {
  const isPublicSharingEnabled = useSelector(state =>
    getSetting(state, "enable-public-sharing"),
  );
  const isAdmin = useSelector(getUserIsAdmin);

  const initialMenuMode: EmbedMenuModes = getEmbedMenuMode({
    isAdmin,
    isPublicSharingEnabled,
    hasPublicLink,
  });
  const [isOpen, setIsOpen] = useState(false);
  const [menuMode, setMenuMode] = useState(initialMenuMode);

  const onMenuSelect = (menuMode?: EmbedMenuModes) => {
    setIsOpen(true);
    if (menuMode) {
      setMenuMode(menuMode);
    }
  };

  const onClose = () => {
    setIsOpen(false);
    setMenuMode(initialMenuMode);
  };

  const targetButton = ({
    onClick = undefined,
  }: { onClick?: () => void } = {}) => {
    return (
      <DashboardEmbedHeaderButton
        onClick={() => {
          onClick?.();
        }}
      />
    );
  };

  const renderEmbedMenu = () => (
    <DashboardEmbedHeaderMenu
      hasPublicLink={hasPublicLink}
      openPublicLinkPopover={() => onMenuSelect("public-link-popover")}
      openEmbedModal={() => {
        onModalOpen && onModalOpen();
        setIsOpen(false);
        setMenuMode(initialMenuMode);
      }}
      target={<div>{targetButton()}</div>}
    />
  );

  const renderPublicLinkPopover = () => {
    return resourceType === "dashboard" ? (
      <DashboardPublicLinkPopover
        dashboard={resource}
        target={targetButton()}
        isOpen={isOpen}
        onClose={onClose}
      />
    ) : (
      <QuestionPublicLinkPopover
        question={resource}
        target={targetButton()}
        isOpen={isOpen}
        onClose={onClose}
      />
    );
  };

  const renderEmbedModalTrigger = () =>
    targetButton({
      onClick: () => {
        onModalOpen?.();
        setIsOpen(false);
      },
    });

  const getEmbedContent = (menuMode: EmbedMenuModes) => {
    if (menuMode === "embed-menu") {
      return renderEmbedMenu();
    } else if (menuMode === "embed-modal") {
      return renderEmbedModalTrigger();
    } else if (menuMode === "public-link-popover") {
      return renderPublicLinkPopover();
    }

    return null;
  };

  return getEmbedContent(menuMode);
};
