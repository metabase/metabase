import type React from "react";

import { Button, Icon, type ModalOverlayProps } from "metabase/ui";

import { Sidesheet, type SidesheetSize } from "./Sidesheet";

interface SidesheetSubPageTitleProps {
  title: React.ReactNode;
  onClick: () => void;
}

interface SidesheetSubPageProps {
  title: React.ReactNode;
  isOpen: boolean;
  onClose: () => void;
  onBack: () => void;
  /** When false, the title is plain text rather than a "back" button */
  showBackButton?: boolean;
  children: React.ReactNode;
  size?: SidesheetSize;
  /** Whether to show a translucent backdrop */
  withOverlay?: boolean;
  overlayProps?: ModalOverlayProps;
}

export const SidesheetSubPageTitle = ({
  title,
  onClick,
}: SidesheetSubPageTitleProps) => {
  return (
    <Button
      variant="transparent"
      size="compact-md"
      h="auto"
      fz="inherit"
      lh="inherit"
      leftSection={<Icon name="chevronleft" />}
      onClick={onClick}
    >
      {title}
    </Button>
  );
};

export const SidesheetSubPage = ({
  title,
  onClose,
  onBack,
  showBackButton = true,
  children,
  isOpen,
  size,
  withOverlay = false,
  overlayProps,
}: SidesheetSubPageProps) => (
  <Sidesheet
    isOpen={isOpen}
    title={
      showBackButton ? (
        <SidesheetSubPageTitle title={title} onClick={onBack} />
      ) : (
        title
      )
    }
    onClose={onClose}
    size={size}
    withOverlay={withOverlay}
    overlayProps={overlayProps}
  >
    {children}
  </Sidesheet>
);
