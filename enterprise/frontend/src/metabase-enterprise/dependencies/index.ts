import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { ConfirmCardUpdateForm } from "./components/ConfirmCardUpdateForm";
import { ConfirmUpdateModalTitle } from "./components/ConfirmUpdateModalTitle";
import { useCheckCardUpdate } from "./hooks/use-check-card-update";

if (hasPremiumFeature("dependencies")) {
  PLUGIN_DEPENDENCIES.ConfirmCardUpdateForm = ConfirmCardUpdateForm;
  PLUGIN_DEPENDENCIES.ConfirmUpdateModalTitle = ConfirmUpdateModalTitle;
  PLUGIN_DEPENDENCIES.useCheckCardUpdate = useCheckCardUpdate;
}
