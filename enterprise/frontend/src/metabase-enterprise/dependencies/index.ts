import { t } from "ttag";

import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { CardUpdateForm } from "./components/CardUpdateForm";
import { useCheckCardUpdate } from "./hooks/use-check-card-update";

if (hasPremiumFeature("dependencies")) {
  PLUGIN_DEPENDENCIES.CardUpdateForm = CardUpdateForm;
  PLUGIN_DEPENDENCIES.useCheckCardUpdate = useCheckCardUpdate;
  PLUGIN_DEPENDENCIES.getUpdateFormTitle = () =>
    t`These changes will break some other things. Save anyway?`;
}
