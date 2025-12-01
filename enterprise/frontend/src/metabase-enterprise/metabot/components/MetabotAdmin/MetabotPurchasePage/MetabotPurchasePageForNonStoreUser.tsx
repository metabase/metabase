import { t } from "ttag";

import { Text } from "metabase/ui";

import type { IPageForNonStoreUserProps } from "./types";

export const MetabotPurchasePageForNonStoreUser = ({
  anyStoreUserEmailAddress,
}: IPageForNonStoreUserProps) => (
  <Text fw="bold">
    {
      /* eslint-disable-next-line no-literal-metabase-strings -- This string only shows for admins. */
      t`Please ask a Metabase Store Admin${anyStoreUserEmailAddress && ` (${anyStoreUserEmailAddress})`} of your organization to enable this for you.`
    }
  </Text>
);
