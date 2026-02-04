import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import { getStoreUsers } from "metabase/selectors/store-users";

import { DataStudioUpsellPage } from "./DataStudioUpsellPage";
import { TransformsPurchasePage } from "./TransformsPurchasePage";

export function TransformsUpsellPage() {
  const bulletPoints = [
    t`Schedule and run transforms as groups with jobs`,
    t`Fast runs with incremental transforms that respond to data changes`,
    t`Predictable costs -  72,000 successful transform runs included every month`,
    t`If you go over your cap, transforms bill at 0.01 per transform run`,
  ];

  const { isStoreUser } = useSelector(getStoreUsers);

  if (isStoreUser) {
    return <TransformsPurchasePage bulletPoints={bulletPoints} />;
  }

  return (
    <DataStudioUpsellPage
      campaign="data-studio-transforms"
      location="data-studio-transforms-page"
      header={t`Transforms`}
      // eslint-disable-next-line metabase/no-literal-metabase-strings -- This string only shows for admins.
      title={t`Tidy up your data right from Metabase`}
      // eslint-disable-next-line metabase/no-literal-metabase-strings -- This string only shows for admins.
      description={t`Transform your data directly in Metabase with powerful data manipulation tools. Reshape tables, clean data, and aggregate without writing SQL.`}
      bulletPoints={bulletPoints}
    />
  );
}
