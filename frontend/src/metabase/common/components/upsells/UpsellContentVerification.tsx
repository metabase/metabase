import { t } from "ttag";

import { UpsellPill } from "metabase/common/components/upsells/components";
import { UPGRADE_URL } from "metabase/common/components/upsells/constants";
import { useHasTokenFeature } from "metabase/common/hooks";

export const UpsellContentVerificationPill = ({
  source,
}: {
  source: string;
}) => {
  const hasContentVerification = useHasTokenFeature("content_verification");

  if (hasContentVerification) {
    return null;
  }

  return (
    <UpsellPill
      campaign="content-verification"
      link={UPGRADE_URL}
      source={source}
    >
      {t`Verify trusted content with Pro`}
    </UpsellPill>
  );
};
