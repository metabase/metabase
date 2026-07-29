import { t } from "ttag";

import { Loader } from "metabase/ui";

import { StorageSetupStatusView } from "./StorageSetupStatusView";

export const StorageSetupView = () => (
  <StorageSetupStatusView
    badge={<Loader size="xs" ml={1} mt={1} />}
    title={t`Setting up storage`}
    description={t`This can take a few minutes.`}
  />
);
