import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { ConfirmUpdateForm } from "./components/ConfirmUpdateForm";
import { ConfirmUpdateModalTitle } from "./components/ConfirmUpdateModalTitle";
import { useCheckCardUpdate } from "./hooks/use-check-card-update";

if (hasPremiumFeature("dependencies")) {
  PLUGIN_DEPENDENCIES.ConfirmUpdateForm = ConfirmUpdateForm;
  PLUGIN_DEPENDENCIES.ConfirmUpdateModalTitle = ConfirmUpdateModalTitle;
  PLUGIN_DEPENDENCIES.useCheckCardUpdate = useCheckCardUpdate;
}
