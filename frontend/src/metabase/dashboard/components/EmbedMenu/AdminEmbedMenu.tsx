import { useState } from "react";
import { t } from "ttag";
import { DashboardEmbedHeaderButton } from "metabase/dashboard/components/DashboardEmbedHeaderButton";
import type {
  EmbedMenuModes,
  EmbedMenuProps,
} from "metabase/dashboard/components/EmbedMenu/types";
import {
  DashboardPublicLinkPopover,
  QuestionPublicLinkPopover,
} from "metabase/dashboard/components/PublicLinkPopover";
import { Menu, Title, Center } from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";
import { AdminEmbedMenuContainer } from "./AdminEmbedMenu.styled";

export const AdminEmbedMenu = ({
  resource,
  resourceType,
  hasPublicLink,
  onModalOpen,
}: EmbedMenuProps) => {
  const [menuMode, setMenuMode] = useState<EmbedMenuModes>(null);

  const target = (
    <DashboardEmbedHeaderButton hasBackground={resourceType === "dashboard"} />
  );

  if (menuMode === "public-link-popover") {
    return resourceType === "dashboard" ? (
      <DashboardPublicLinkPopover
        dashboard={resource}
        target={target}
        isOpen={true}
        onClose={() => setMenuMode(null)}
      />
    ) : (
      <QuestionPublicLinkPopover
        question={resource}
        target={target}
        isOpen={true}
        onClose={() => setMenuMode(null)}
      />
    );
  }

  return (
    <Menu withinPortal position="bottom-start">
      <Menu.Target>{target}</Menu.Target>

      <AdminEmbedMenuContainer w="13.75rem" data-testid="embed-header-menu">
        <Menu.Item
          data-testid="embed-menu-public-link-item"
          py="md"
          icon={
            <Center mr="xs">
              <Icon name="link" />
            </Center>
          }
          onClick={() => setMenuMode("public-link-popover")}
        >
          <Title c="inherit" order={4}>
            {hasPublicLink ? t`Public link` : t`Create a public link`}
          </Title>
        </Menu.Item>

        <Menu.Item
          data-testid="embed-menu-embed-modal-item"
          py="md"
          icon={
            <Center mr="xs">
              <Icon name="embed" />
            </Center>
          }
          onClick={onModalOpen}
        >
          <Title c="inherit" order={4}>
            {t`Embed`}
          </Title>
        </Menu.Item>
      </AdminEmbedMenuContainer>
    </Menu>
  );
};
