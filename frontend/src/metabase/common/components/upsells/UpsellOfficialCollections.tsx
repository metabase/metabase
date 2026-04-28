import { t } from "ttag";

import { UpsellPill } from "metabase/common/components/upsells/components";
import { UPGRADE_URL } from "metabase/common/components/upsells/constants";
import { useHasTokenFeature } from "metabase/common/hooks";

export const UpsellOfficialCollectionsPill = ({
  source,
}: {
  source: string;
}) => {
  const hasOfficialCollections = useHasTokenFeature("official_collections");

  if (hasOfficialCollections) {
    return null;
  }

  return (
    <UpsellPill
      campaign="official-collections"
      link={UPGRADE_URL}
      source={source}
    >
      {t`Mark collections official with Pro`}
    </UpsellPill>
  );
};
