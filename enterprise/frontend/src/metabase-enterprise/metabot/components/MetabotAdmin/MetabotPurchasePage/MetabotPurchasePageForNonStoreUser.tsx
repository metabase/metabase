import { t } from "ttag";

import { Text } from "metabase/ui";

import type { IPageForNonStoreUserProps } from "./types";

export const MetabotPurchasePageForNonStoreUser = ({
  anyStoreUserEmailAddress,
}: IPageForNonStoreUserProps) => (
  <>
    <video controls aria-label={t`Demonstration of Metabot AI features`}>
      <source
        src="https://www.metabase.com/images/features/metabot.mp4"
        type="video/mp4"
      />
      {t`Your browser does not support the video tag.`}
    </video>
    <Text fw="bold">
      {
        /* eslint-disable-next-line metabase/no-literal-metabase-strings -- This string only shows for admins. */
        t`Please ask a Metabase Store Admin${anyStoreUserEmailAddress && ` (${anyStoreUserEmailAddress})`} of your organization to enable this for you.`
      }
    </Text>
  </>
);
