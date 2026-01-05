import type React from "react";

import { Button, Flex, Icon, type ModalOverlayProps, Title } from "metabase/ui";

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
    <Button variant="subtle" onClick={onClick} p={0}>
      <Flex align="center" justify="center" gap="md">
        <Icon name="chevronleft" />
        <Title order={3}>{title}</Title>
      </Flex>
    </Button>
  );
};

export const SidesheetSubPage = ({
  title,
  onClose,
  onBack,
  children,
  isOpen,
  size,
  withOverlay = false,
  overlayProps,
}: SidesheetSubPageProps) => (
  <Sidesheet
    isOpen={isOpen}
    title={<SidesheetSubPageTitle title={title} onClick={onBack} />}
    onClose={onClose}
    size={size}
    withOverlay={withOverlay}
    overlayProps={overlayProps}
  >
    {children}
  </Sidesheet>
);
