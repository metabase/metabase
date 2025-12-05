import type { ReactElement } from "react";
import { t } from "ttag";

import { SettingsPageWrapper } from "metabase/admin/components/SettingsSection";
import { useSelector } from "metabase/lib/redux";
import { getStoreUsers } from "metabase/selectors/store-users";
import { Text } from "metabase/ui";

import { MetabotPurchasePageForNonStoreUser } from "./MetabotPurchasePageForNonStoreUser";
import { MetabotPurchasePageForStoreUser } from "./MetabotPurchasePageForStoreUser";

export function MetabotPurchasePage(): ReactElement {
  const { isStoreUser, anyStoreUserEmailAddress } = useSelector(getStoreUsers);

  return (
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
  );
}
