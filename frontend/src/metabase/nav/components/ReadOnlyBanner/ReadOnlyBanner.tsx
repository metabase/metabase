import { t } from "ttag";

import { Banner } from "metabase/common/components/Banner";
import { Text } from "metabase/ui";

export const ReadOnlyBanner = () => {
  return (
    <Banner
      bg="warning"
      body={
        <Text fw="bold" c="text-primary">
          {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- correct usage */}
          {t`Metabase is under maintenance and is operating in read-only mode. It should only take up to 30 minutes.`}
        </Text>
      }
      icon="info"
    />
  );
};
