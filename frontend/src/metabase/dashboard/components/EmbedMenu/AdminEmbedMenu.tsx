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
import { useSelector } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";
import { Menu, Title, Text, Stack, Center } from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";
import { AdminEmbedMenuContainer } from "./AdminEmbedMenu.styled";

export const AdminEmbedMenu = ({
  resource,
  resourceType,
  hasPublicLink,
  onModalOpen,
}: EmbedMenuProps) => {
  const [menuMode, setMenuMode] = useState<EmbedMenuModes>(null);

  const isPublicSharingEnabled = useSelector(state =>
    getSetting(state, "enable-public-sharing"),
  );
  const isEmbeddingEnabled = useSelector(state =>
    getSetting(state, "enable-embedding"),
  );

  const target = <DashboardEmbedHeaderButton />;

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
          py={isPublicSharingEnabled ? "md" : "sm"}
          icon={
            <Center mr="xs">
              <Icon name="link" />
            </Center>
          }
          disabled={!isPublicSharingEnabled}
          onClick={() => setMenuMode("public-link-popover")}
        >
          {isPublicSharingEnabled ? (
            <Title c="inherit" order={4}>
              {hasPublicLink ? t`Public link` : t`Create a public link`}
            </Title>
          ) : (
            <Stack spacing="xs">
              <Title c="inherit" order={4}>
                {t`Public links are off`}
              </Title>
              <Text size="sm" c="inherit">{t`Enable them in settings`}</Text>
            </Stack>
          )}
        </Menu.Item>

        <Menu.Item
          data-testid="embed-menu-embed-modal-item"
          py="md"
          icon={
            <Center mr="xs">
              <Icon name="embed" />
            </Center>
          }
          disabled={!isEmbeddingEnabled}
          onClick={onModalOpen}
        >
          {isEmbeddingEnabled ? (
            <Title c="inherit" order={4}>
              {t`Embed`}
            </Title>
          ) : (
            <Stack spacing="xs">
              <Title c="inherit" order={4}>
                {t`Embedding is off`}
              </Title>
              <Text size="sm" c="inherit">{t`Enable it in settings`}</Text>
            </Stack>
          )}
        </Menu.Item>
      </AdminEmbedMenuContainer>
    </Menu>
  );
};
