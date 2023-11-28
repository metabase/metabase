import { useState } from "react";
import { DashboardEmbedHeaderButton } from "metabase/dashboard/components/DashboardEmbedHeaderButton";
import { DashboardEmbedHeaderMenu } from "metabase/dashboard/components/DashboardEmbedHeaderMenu";
import { useSelector } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Popover } from "metabase/ui";

export type EmbedMenuModes =
  | "embed-menu"
  | "embed-modal"
  | "public-link-popover"
  | null;

export const EmbedMenu = ({
  resource_uuid,
  onModalOpen,
  onModalClose,
}: {
  resource_uuid?: string | null;
  onModalOpen?: () => void;
  onModalClose?: () => void;
}) => {
  const hasPublicLink = !!resource_uuid;

  const initialMenuMode: EmbedMenuModes = useEmbedMenuMode({
    hasPublicLink,
  });

  const [isOpen, setIsOpen] = useState(false);
  const [menuMode, setMenuMode] = useState(initialMenuMode);

  const onMenuSelect = (menuMode: EmbedMenuModes) => {
    setIsOpen(true);
    setMenuMode(menuMode);
  };

  const renderEmbedMenu = () => (
    <DashboardEmbedHeaderMenu
      hasPublicLink={hasPublicLink}
      /* TODO: Change to `onMenuSelect("public-link-popover")}` when public link popover is implemented */
      openPublicLinkPopover={() => onMenuSelect("public-link-popover")}
      openEmbedModal={onModalOpen}
      target={<DashboardEmbedHeaderButton />}
    />
  );

  const renderEmbedModalTrigger = () => (
    <DashboardEmbedHeaderButton
      onClick={() => {
        onModalOpen?.();
        setIsOpen(false);
      }}
    />
  );

  const onClosePublicLinkPopover = () => {
    setIsOpen(false);
    setMenuMode(initialMenuMode);
  };

  const renderPublicLinkPopover = () => {
    return (
      <Popover opened={isOpen} onClose={onClosePublicLinkPopover}>
        <Popover.Target>
          <DashboardEmbedHeaderButton
            onClick={isOpen ? onClosePublicLinkPopover : () => setIsOpen(true)}
          />
        </Popover.Target>
        <Popover.Dropdown>
          <div>Public Link Popover</div>
        </Popover.Dropdown>
      </Popover>
    );
  };

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

const useEmbedMenuMode = ({
  hasPublicLink,
}: {
  hasPublicLink: boolean;
}): EmbedMenuModes => {
  const isPublicSharingEnabled = useSelector(state =>
    getSetting(state, "enable-public-sharing"),
  );
  const isAdmin = useSelector(getUserIsAdmin);
  if (isAdmin) {
    return isPublicSharingEnabled ? "embed-menu" : "embed-modal";
  }

  if (isPublicSharingEnabled && hasPublicLink) {
    return "public-link-popover";
  }

  return null;
};
