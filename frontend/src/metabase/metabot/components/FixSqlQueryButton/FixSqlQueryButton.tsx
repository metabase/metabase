import { isFulfilled } from "@reduxjs/toolkit";
import { t } from "ttag";

import { useToast } from "metabase/common/hooks";
import { getMetabotManagedProviderLimitToastProps } from "metabase/metabot/components/MetabotManagedProviderLimit";
import { METABOT_ERR_MSG } from "metabase/metabot/constants";
import {
  useMetabotAgent,
  useMetabotName,
  useUserMetabotPermissions,
} from "metabase/metabot/hooks";
import { setIsNativeEditorOpen } from "metabase/query_builder/actions";
import { useDispatch } from "metabase/redux";
import { Button } from "metabase/ui";

import { trackQueryFixClicked } from "../../analytics";
import { getMetabotNotConfiguredToastProps } from "../AIProviderConfigurationNotice";

export function FixSqlQueryButton() {
  const dispatch = useDispatch();
  const { hasSqlGenerationAccess, canUseSqlGeneration } =
    useUserMetabotPermissions();
  const metabotName = useMetabotName();
  const [sendToast] = useToast();
  const { submitInput, isDoingScience } = useMetabotAgent("sql");

  if (!hasSqlGenerationAccess) {
    return null;
  }

  const handleClick = async () => {
    if (!canUseSqlGeneration) {
      sendToast(
        getMetabotNotConfiguredToastProps({
          featureName: metabotName,
        }),
      );
      return;
    }
    trackQueryFixClicked();
    await dispatch(setIsNativeEditorOpen(true));
    // SQL and error message are included in the context.
    const action = await submitInput("Fix this SQL query", {
      preventOpenSidebar: true,
    });

    if (!isFulfilled(action) || action.payload.success) {
      return;
    }

    if (action.payload.errorMessage?.type === "locked") {
      sendToast(getMetabotManagedProviderLimitToastProps());
      return;
    }

    sendToast({
      icon: "warning",
      toastColor: "error",
      message: action.payload.errorMessage?.message ?? METABOT_ERR_MSG.default,
    });
  };

  return (
    <Button
      loading={isDoingScience}
      onClick={handleClick}
    >{t`Have ${metabotName} fix it`}</Button>
  );
}
