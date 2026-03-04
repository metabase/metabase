import { t } from "ttag";

import { Banner } from "metabase/common/components/Banner";
import { Text } from "metabase/ui";

export const DevModeBanner = () => {
  return (
    <Banner
      bg="warning"
      body={
        <Text fw="bold" c="text-primary">
          {t`This instance is in development mode. It is not allowed to be used for production purposes. All content is watermarked.`}
        </Text>
      }
      icon="info"
    />
  );
};
