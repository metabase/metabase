import { t } from "ttag";

import { DataStudioUpsellPage } from "metabase/data-studio/upsells";
import { useSelector } from "metabase/lib/redux";
import { getStoreUsers } from "metabase/selectors/store-users";

import { TransformsPurchasePage } from "./TransformsPurchasePage";

export function TransformsUpsellPage() {
  const { isStoreUser } = useSelector(getStoreUsers);

  if (isStoreUser) {
    return <TransformsPurchasePage />;
  }

  return (
    <DataStudioUpsellPage
      campaign="data-studio-transforms"
      location="data-studio-transforms-page"
      // eslint-disable-next-line metabase/no-literal-metabase-strings -- This string only shows for admins.
      title={t`Tidy up your data right from Metabase`}
      // eslint-disable-next-line metabase/no-literal-metabase-strings -- This string only shows for admins.
      description={t`Transform your data directly in Metabase with powerful data manipulation tools. Reshape tables, clean data, and aggregate without writing SQL.`}
    />
  );
}
