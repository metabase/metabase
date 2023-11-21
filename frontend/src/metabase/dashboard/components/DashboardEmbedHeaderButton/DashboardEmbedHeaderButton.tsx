import { useState } from "react";
import { t } from "ttag";
import { DashboardHeaderButton } from "metabase/dashboard/components/DashboardHeader/DashboardHeader.styled";
import DashboardSharingEmbeddingModal from "metabase/dashboard/containers/DashboardSharingEmbeddingModal";
import { Tooltip, Menu, Title, Text } from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";
import type { Dashboard } from "metabase-types/api";

export type DashboardEmbedHeaderButtonProps = {
  dashboard: Dashboard;
  admin: boolean;
  linkEnabled: boolean;
  publicLinksEnabled: boolean;
};

export const DashboardEmbedHeaderButton = ({
  dashboard,
  admin,
  linkEnabled,
  publicLinksEnabled,
}: DashboardEmbedHeaderButtonProps) => {
  const [openEmbedModal, setOpenEmbedModal] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const tooltipLabel = publicLinksEnabled ? t`Sharing` : t`Embedding`;
  const hasPublicLink = publicLinksEnabled && dashboard.public_uuid;

  const canCreatePublicLink = admin && !hasPublicLink && publicLinksEnabled;
  const publicLinkOptionLabel = canCreatePublicLink
    ? t`Create a public link`
    : t`Public link`;

  const dashboardButton = (onClick?: () => void) => (
    <Tooltip
      label={
        <Text c="inherit" size="sm" fw={700}>
          {tooltipLabel}
        </Text>
      }
      offset={8}
    >
      {/*Needs to be wrapped in a div so Menu.Target can still calculate the dropdown position */}
      <div>
        <DashboardHeaderButton
          key="dashboard-embed-button"
          onClick={onClick}
          icon="share"
        />
      </div>
    </Tooltip>
  );

  const embedModal = () => (
    <DashboardSharingEmbeddingModal
      key="dashboard-embed"
      dashboard={dashboard}
      enabled={true}
      onClose={() => setOpenEmbedModal(false)}
      isLinkEnabled={linkEnabled}
    />
  );

  if (!admin) {
    if (hasPublicLink && publicLinksEnabled) {
      return (
        <>
          {dashboardButton()}
          {/*  TODO: Render the public link popover here*/}
        </>
      );
    }
    return null;
  }

  if (!publicLinksEnabled) {
    return (
      <>
        {dashboardButton(() => setOpenEmbedModal(true))}
        {openEmbedModal && embedModal()}
      </>
    );
  }

  return (
    <>
      <Menu
        position="bottom-start"
        offset={8}
        opened={isMenuOpen}
        onChange={setIsMenuOpen}
      >
        <Menu.Target>
          {dashboardButton(() => setIsMenuOpen(!isMenuOpen))}
        </Menu.Target>
        <Menu.Dropdown data-testid="embed-header-menu">
          <Menu.Item p="md" icon={<Icon name="link" />}>
            <Title c="inherit" order={4}>
              {publicLinkOptionLabel}
            </Title>
          </Menu.Item>
          <Menu.Item
            onClick={() => setOpenEmbedModal(true)}
            p="md"
            icon={<Icon name="embed" />}
          >
            <Title c="inherit" order={4}>
              {t`Embed`}
            </Title>
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>

      {openEmbedModal && embedModal()}
      {/* TODO: Render the link popover here  */}
    </>
  );
};
