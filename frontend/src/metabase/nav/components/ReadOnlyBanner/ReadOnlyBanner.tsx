import { t } from "ttag";

import Banner from "metabase/components/Banner";

export const ReadOnlyBanner = () => {
  return <Banner>{t`You are in read only mode. Also Ryan is mean`}</Banner>;
};
