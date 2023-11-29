import { useState } from "react";
import { DashboardEmbedHeaderButton } from "metabase/dashboard/components/DashboardEmbedHeaderButton";
import { DashboardEmbedHeaderMenu } from "metabase/dashboard/components/DashboardEmbedHeaderMenu";
import { useSelector } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";
import { getUserIsAdmin } from "metabase/selectors/user";
import type { Dashboard } from "metabase-types/api";
import { Popover } from "metabase/ui";
import type Question from "metabase-lib/Question";

export type EmbedMenuModes =
  | "embed-menu"
  | "embed-modal"
  | "public-link-popover"
  | "embedding-disabled"
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

type EmbedMenuProps = ResourceType & {
  hasPublicLink: boolean;
  onModalOpen: () => void;
};

export const EmbedMenu = (props: EmbedMenuProps) => {
  const isPublicSharingEnabled = useSelector(state =>
    getSetting(state, "enable-public-sharing"),
  );

  const isEmbeddingEnabled = useSelector(state =>
    getSetting(state, "enable-embedding"),
  );

  const isAdmin = useSelector(getUserIsAdmin);

  const shouldRenderForUser = isAdmin || props.hasPublicLink;

  if (
    isEmbeddingEnabled == null ||
    isPublicSharingEnabled == null ||
    !shouldRenderForUser
  ) {
    return null;
  }

  return <EmbedMenuInner {...props} />;
};

const EmbedMenuInner = ({ hasPublicLink, onModalOpen }: EmbedMenuProps) => {
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
      openPublicLinkPopover={() => onMenuSelect("public-link-popover")}
      openEmbedModal={onModalOpen}
      target={<DashboardEmbedHeaderButton />}
    />
  );

  const renderEmbedModalTrigger = () => (
    <DashboardEmbedHeaderButton onClick={onModalOpen} />
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

  const renderEmbeddingDisabled = () => {
    return <DashboardEmbedHeaderButton disabled />;
  };

  const getEmbedContent = (menuMode: EmbedMenuModes) => {
    if (menuMode === "embed-menu") {
      return renderEmbedMenu();
    } else if (menuMode === "embed-modal") {
      return renderEmbedModalTrigger();
    } else if (menuMode === "public-link-popover") {
      return renderPublicLinkPopover();
    } else if (menuMode === "embedding-disabled") {
      return renderEmbeddingDisabled();
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

  const isEmbeddingEnabled = useSelector(state =>
    getSetting(state, "enable-embedding"),
  );

  const isAdmin = useSelector(getUserIsAdmin);

  if (isAdmin) {
    if (!isEmbeddingEnabled) {
      return "embedding-disabled";
    }
    
    if (isPublicSharingEnabled) {
      return "embed-menu"
    }
    
    return "embed-modal";
  }

  if (isPublicSharingEnabled && hasPublicLink) {
    return "public-link-popover";
  }

  return null;
};
