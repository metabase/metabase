import { t } from "ttag";

import { Banner } from "metabase/components/Banner";
import { Text } from "metabase/ui";

export const DevModeBanner = () => {
  return (
    <Banner
      bg="warning"
      body={
        <Text fw="bold" c="text-dark">
          {t`This instance is in development mode. It is not allowed to be used for production purposes. All content is watermarked.`}
        </Text>
      }
      icon="info_filled"
    />
  );
};
