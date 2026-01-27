import { IndexRedirect, Route } from "react-router";
import { t } from "ttag";

import ErrorBoundary from "metabase/ErrorBoundary";
import {
  AdminNavItem,
  AdminNavWrapper,
} from "metabase/admin/components/AdminNav";
import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { UpsellGem } from "metabase/admin/upsells/components";
import { AdminSettingsLayout } from "metabase/common/components/AdminLayout/AdminSettingsLayout";
import { Flex, Text } from "metabase/ui";

import { MetabotSQLGenerationSettingsSection } from "./MetabotSQLGenerationSettingsSection";

// import { MetabotPurchasePageForNonStoreUser } from "metabase-enterprise/metabot/components/MetabotAdmin/MetabotPurchasePage/MetabotPurchasePageForNonStoreUser";
// import { useSelector } from "metabase/lib/redux";
// import { getStoreUsers } from "metabase/selectors/store-users";

export function getAdminRoutes() {
  return [
    <IndexRedirect key="index" to="sql-generation" />,
    <Route
      key="sql-generation"
      path="sql-generation"
      component={MetabotAdminSQLGenerationPage}
    />,
    <Route
      key="metabot"
      path=":metabotId"
      component={MetabotAdminUpsellPage}
    />,
  ];
}

function MetabotAdminSQLGenerationPage() {
  return (
    <AdminSettingsLayout sidebar={<MetabotNavPane />}>
      <ErrorBoundary>
        <MetabotSQLGenerationSettingsSection />
      </ErrorBoundary>
    </AdminSettingsLayout>
  );
}

function MetabotAdminUpsellPage() {
  // const { isStoreUser, anyStoreUserEmailAddress } = useSelector(getStoreUsers);

  return (
    <AdminSettingsLayout sidebar={<MetabotNavPane />}>
      <ErrorBoundary>
        <SettingsPageWrapper>
          <SettingsSection
            title={
              <Flex gap="xs" align="center">
                <UpsellGem size="1.25rem" mb="1px" />
                {t`Purchase Metabot`}
              </Flex>
            }
            description={t`AI exploration built on your permissions and semantic definitions`}
          >
            <Text>
              {t`Metabot helps you move faster and understand your data better.`}
              <br />
              {t`You can ask it to generate SQL, and build or explain queries.`}
            </Text>
            {/* isStoreUser ? null : ( // <MetabotPurchasePageForStoreUser />
              <MetabotPurchasePageForNonStoreUser
                anyStoreUserEmailAddress={anyStoreUserEmailAddress}
              />
            ) */}
          </SettingsSection>
        </SettingsPageWrapper>
      </ErrorBoundary>
    </AdminSettingsLayout>
  );
}

function MetabotNavPane() {
  return (
    <Flex direction="column" flex="0 0 auto">
      <AdminNavWrapper>
        <AdminNavItem
          key="sql"
          icon="sql"
          label={t`SQL Generation`}
          path="/admin/metabot/sql-generation"
        />
        <AdminNavItem
          key="metabot"
          icon="metabot"
          label={
            <Flex gap="sm">
              {t`Metabot`}
              <UpsellGem />
            </Flex>
          }
          path="/admin/metabot/1"
        />
        <AdminNavItem
          key="embedded-metabot"
          icon="metabot"
          label={
            <Flex gap="sm">
              {t`Embedded Metabot`}
              <UpsellGem />
            </Flex>
          }
          path="/admin/metabot/2"
        />
      </AdminNavWrapper>
    </Flex>
  );
}
