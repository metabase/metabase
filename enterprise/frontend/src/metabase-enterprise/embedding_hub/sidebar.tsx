import { t } from "ttag";

// Needed for nice react router movement
import Link from "metabase/core/components/Link";
import { Icon, NavLink, Text } from "metabase/ui";

export function Sidebar() {
  return (
    <>
      <NavLink
        variant="admin"
        label="Overview"
        component={Link}
        to="/admin/embedding/overview"
        leftSection={<Icon name="star" />}
        active={/^\/admin\/embedding\/overview/.test(location.pathname)}
      />
      <Text size="sm" mt="lg" mb="sm">{t`Embedding types`}</Text>
      <NavLink
        variant="admin"
        label="Static"
        component={Link}
        to="/admin/embedding/static"
        leftSection={<Icon name="snippet" />}
        active={/^\/admin\/embedding\/static/.test(location.pathname)}
      />
      <NavLink
        variant="admin"
        label="Interactive"
        leftSection={<Icon name="click" />}
      >
        <NavLink
          variant="admin"
          label="Settings"
          component={Link}
          to="/admin/embedding/interactive/settings"
          active={/^\/admin\/embedding\/interactive\/settings/.test(
            location.pathname,
          )}
        />
        <NavLink
          variant="admin"
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
        variant="admin"
        label="Appearance"
        component={Link}
        to="/admin/embedding/appearance"
        leftSection={<Icon name="palette" />}
        active={/^\/admin\/embedding\/appearance/.test(location.pathname)}
      />
      <NavLink
        variant="admin"
        label="Maps"
        component={Link}
        to="/admin/embedding/maps"
        leftSection={<Icon name="location" />}
        active={/^\/admin\/embedding\/maps/.test(location.pathname)}
      />
      <NavLink
        variant="admin"
        label="UI Reference"
        component={Link}
        to="/admin/embedding/reference"
        leftSection={<Icon name="reference" />}
        active={/^\/admin\/embedding\/reference/.test(location.pathname)}
      >
        <NavLink
          variant="admin"
          label="UI Patterns"
          component={Link}
          to="/admin/embedding/reference/ui-patterns"
          active={/^\/admin\/embedding\/reference\/ui-patterns/.test(
            location.pathname,
          )}
        />
        <NavLink
          variant="admin"
          label="List Patterns"
          component={Link}
          to="/admin/embedding/reference/list-patterns"
          active={/^\/admin\/embedding\/reference\/list-patterns/.test(
            location.pathname,
          )}
        />
        <NavLink
          variant="admin"
          label="Localization"
          component={Link}
          to="/admin/embedding/reference/localization"
          active={/^\/admin\/embedding\/reference\/localization/.test(
            location.pathname,
          )}
        />
        <NavLink
          variant="admin"
          label="Color Tester"
          component={Link}
          to="/admin/embedding/reference/color-tester"
          active={/^\/admin\/embedding\/reference\/color-tester/.test(
            location.pathname,
          )}
        />
      </NavLink>
    </>
  );
}
