import { t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { useStoreUrl } from "metabase/common/hooks";
import { Button, Icon } from "metabase/ui";

import { StorageSetupStatusView } from "./StorageSetupStatusView";

export const StorageSetupErrorView = () => {
  const storeUrl = useStoreUrl("account/storage");

  return (
    <StorageSetupStatusView
      badge={<Icon name="warning_triangle_filled" size={12} color="warning" />}
      title={t`Storage setup didn't finish`}
      description={t`Something went wrong setting up your storage. Contact support to sort it out.`}
      action={
        <Button component={ExternalLink} href={storeUrl} variant="filled">
          {t`Go to your account`}
        </Button>
      }
    />
  );
};
