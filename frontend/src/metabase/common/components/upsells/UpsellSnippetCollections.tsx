import { t } from "ttag";

import { UpsellPill } from "metabase/common/components/upsells/components";
import { UPGRADE_URL } from "metabase/common/components/upsells/constants";
import { useHasTokenFeature } from "metabase/common/hooks";

export const UpsellSnippetCollectionsPill = ({
  source,
}: {
  source: string;
}) => {
  const hasSnippetCollections = useHasTokenFeature("snippet_collections");

  if (hasSnippetCollections) {
    return null;
  }

  return (
    <UpsellPill
      campaign="snippet-collections"
      link={UPGRADE_URL}
      source={source}
    >
      {t`Organize snippets in folders with Pro`}
    </UpsellPill>
  );
};
