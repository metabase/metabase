import { IndexRedirect } from "react-router";
import { t } from "ttag";

// Needed for nice react router movement
import Link from "metabase/core/components/Link";
import { Route } from "metabase/hoc/Title";

// HACK - For the real real we'd export these from metabase/ui
//eslint-disable-next-line
import { AppShell, Container } from "@mantine/core";
import { color } from "metabase/lib/colors";
import { Icon, NavLink, Text, Title } from "metabase/ui";

import {
  AppearancePage,
  InteractiveSettingsPage,
  OverviewPage,
  UserManagementPage,
} from "./pages";

function Sidebar() {
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

function StaticEmbedding() {
  return <Title>{t`Static`}</Title>;
}

function EmbeddingLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell navbar={{ width: 300, breakpoint: "md" }} header={{ height: 66 }}>
      <AppShell.Navbar
        p="md"
        style={{ borderRight: `1px solid ${color("border")}` }}
      >
        <Sidebar />
      </AppShell.Navbar>
      <AppShell.Main bg={color("bg-light")}>
        <Container>{children}</Container>
      </AppShell.Main>
    </AppShell>
  );
}

export const getRoutes = () => (
  <Route path="embedding" component={EmbeddingLayout}>
    <IndexRedirect to="overview" />
    <Route path="overview" component={OverviewPage} />
    <Route path="static" component={StaticEmbedding} />
    <Route path="interactive">
      <Route path="settings" component={InteractiveSettingsPage} />
      <Route path="user-management" component={UserManagementPage} />
    </Route>
    <Route path="appearance" component={AppearancePage} />
  </Route>
);
