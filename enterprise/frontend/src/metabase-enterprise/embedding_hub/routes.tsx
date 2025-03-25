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
        label="Overview"
        component={Link}
        to="/admin/embedding/overview"
        leftSection={<Icon name="star" />}
      />
      <Text size="sm" mt="lg" mb="sm">{t`Embedding types`}</Text>
      <NavLink
        label="Static"
        component={Link}
        to="/admin/embedding/static"
        leftSection={<Icon name="snippet" />}
      />
      <NavLink label="Interactive" leftSection={<Icon name="click" />}>
        <NavLink
          label="Settings"
          component={Link}
          to="/admin/embedding/interactive/settings"
        />
        <NavLink
          label="User management"
          component={Link}
          to="/admin/embedding/interactive/user-management"
        />
        <NavLink label="Frameworks" />
      </NavLink>
      <Text size="sm" mt="lg" mb="sm">{t`Shared settings`}</Text>
      <NavLink
        label="Appearance"
        component={Link}
        to="/admin/embedding/appearance"
        leftSection={<Icon name="palette" />}
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
      <AppShell.Navbar p="md">
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
