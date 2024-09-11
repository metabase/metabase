import type React from "react";

import { Button, Flex, Icon, Title } from "metabase/ui";

import { Sidesheet } from "./Sidesheet";

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
}

export const SidesheetSubPageTitle = ({
  title,
  onClick,
}: SidesheetSubPageTitleProps) => {
  return (
    <Button variant="unstyled" onClick={onClick} p={0}>
      <Flex align="center" justify="center" gap="md">
        <Icon name="chevronleft" />
        <Title order={2}>{title}</Title>
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
}: SidesheetSubPageProps) => (
  <Sidesheet
    isOpen={isOpen}
    title={<SidesheetSubPageTitle title={title} onClick={onBack} />}
    onClose={onClose}
  >
    {children}
  </Sidesheet>
);
