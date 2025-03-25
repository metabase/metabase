import { t } from "ttag";

// Needed for nice react router movement
import Link from "metabase/core/components/Link";
import { Icon, NavLink, Text } from "metabase/ui";

export function Sidebar() {
  return (
    <>
      <NavLink
        variant="default"
        label="Overview"
        component={Link}
        to="/admin/embedding/overview"
        leftSection={<Icon name="star" />}
        active={/^\/admin\/embedding\/overview/.test(location.pathname)}
      />
      <Text size="sm" mt="lg" mb="sm">{t`Embedding types`}</Text>
      <NavLink
        variant="default"
        label="Static"
        component={Link}
        to="/admin/embedding/static"
        leftSection={<Icon name="snippet" />}
        active={/^\/admin\/embedding\/static/.test(location.pathname)}
      />
      <NavLink
        variant="default"
        label="Interactive"
        leftSection={<Icon name="click" />}
      >
        <NavLink
          variant="default"
          label="Settings"
          component={Link}
          to="/admin/embedding/interactive/settings"
          active={/^\/admin\/embedding\/interactive\/settings/.test(
            location.pathname,
          )}
        />
        <NavLink
          variant="default"
          label="User management"
          component={Link}
          to="/admin/embedding/interactive/user-management"
          active={/^\/admin\/embedding\/interactive\/user-management/.test(
            location.pathname,
          )}
        />
        <NavLink variant="default" label="Frameworks" />
      </NavLink>
      <Text size="sm" mt="lg" mb="sm">{t`Shared settings`}</Text>
      <NavLink
        variant="default"
        label="Appearance"
        component={Link}
        to="/admin/embedding/appearance"
        leftSection={<Icon name="palette" />}
        active={/^\/admin\/embedding\/appearance/.test(location.pathname)}
      />
    </>
  );
}
