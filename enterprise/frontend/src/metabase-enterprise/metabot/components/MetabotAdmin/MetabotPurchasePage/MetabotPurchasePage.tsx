import type { ReactElement } from "react";
import { IndexRoute, Redirect } from "react-router";
import { t } from "ttag";

import { SettingsPageWrapper } from "metabase/admin/components/SettingsSection";
import { AdminSettingsLayout } from "metabase/common/components/AdminLayout/AdminSettingsLayout";
import { useSelector } from "metabase/lib/redux";
import { getStoreUsers } from "metabase/selectors/store-users";
import { Text } from "metabase/ui";

import { MetabotPurchasePageForNonStoreUser } from "./MetabotPurchasePageForNonStoreUser";
import { MetabotPurchasePageForStoreUser } from "./MetabotPurchasePageForStoreUser";

export function getAdminRoutes() {
  return [
    <IndexRoute key="index" component={MetabotPurchasePage} />,
    <Redirect key="redirect" from="*" to="/admin/metabot" />,
  ];
}

export function MetabotPurchasePage(): ReactElement {
  const { isStoreUser, anyStoreUserEmailAddress } = useSelector(getStoreUsers);

  return (
    <AdminSettingsLayout>
      <SettingsPageWrapper title={t`Metabot AI`}>
        <Text>
          {t`Metabot helps you move faster and understand your data better.`}
          <br />
          {t`You can ask it to generate SQL, and build or explain queries.`}
        </Text>
        {isStoreUser ? (
          <MetabotPurchasePageForStoreUser />
        ) : (
          <MetabotPurchasePageForNonStoreUser
            anyStoreUserEmailAddress={anyStoreUserEmailAddress}
          />
        )}
      </SettingsPageWrapper>
    </AdminSettingsLayout>
  );
}
