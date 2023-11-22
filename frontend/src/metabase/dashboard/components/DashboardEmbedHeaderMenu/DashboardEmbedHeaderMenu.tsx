import { t } from "ttag";
import { useSelector } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Menu, Title } from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";

export type DashboardEmbedHeaderMenuProps = {
  hasPublicLink: boolean;
  target: JSX.Element;
  openPublicLinkPopover: () => void;
  openEmbedModal: () => void;
};

export const DashboardEmbedHeaderMenu = ({
  hasPublicLink,
  target,
  openPublicLinkPopover,
  openEmbedModal,
}: DashboardEmbedHeaderMenuProps) => {
  const isPublicSharingEnabled = useSelector(state =>
    getSetting(state, "enable-public-sharing"),
  );

  const isAdmin = useSelector(getUserIsAdmin);

  const canCreatePublicLink =
    isAdmin && isPublicSharingEnabled && !hasPublicLink;
  const publicLinkOptionLabel = canCreatePublicLink
    ? t`Create a public link`
    : t`Public link`;

  return (
    <Menu position="bottom-start" offset={8}>
      <Menu.Target>{target}</Menu.Target>
      <Menu.Dropdown data-testid="embed-header-menu">
        <Menu.Item
          p="md"
          icon={<Icon name="link" />}
          onClick={openPublicLinkPopover}
        >
          <Title c="inherit" order={4}>
            {publicLinkOptionLabel}
          </Title>
        </Menu.Item>
        <Menu.Item p="md" icon={<Icon name="embed" />} onClick={openEmbedModal}>
          <Title c="inherit" order={4}>
            {t`Embed`}
          </Title>
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
};
