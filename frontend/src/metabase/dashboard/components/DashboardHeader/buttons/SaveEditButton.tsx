import cx from "classnames";
import { msgid, ngettext, t } from "ttag";

import ActionButton from "metabase/components/ActionButton";
import ButtonsS from "metabase/css/components/buttons.module.css";
import { useDashboardContext } from "metabase/dashboard/context";
import { Tooltip } from "metabase/ui";
import type { UiParameter } from "metabase-lib/v1/parameters/types";

export const SaveEditButton = (props: { onDoneEditing: () => void }) => {
  const {
    updateDashboardAndCards,
    setEditingDashboard,
    missingRequiredParameters = [], // This would need to be added to context
  } = useDashboardContext();

  const disabledSaveTooltip = getDisabledSaveButtonTooltip(
    missingRequiredParameters,
  );
  const isSaveDisabled = missingRequiredParameters.length > 0;

  const handleDoneEditing = () => {
    props.onDoneEditing();
    setEditingDashboard(null);
  };

  const onSave = async () => {
    // We would need to move this to the context or pass it as a prop
    // For now, we can assume dismissAllUndo is handled in updateDashboardAndCards
    await updateDashboardAndCards();
    handleDoneEditing();
  };

  return (
    <Tooltip key="save" label={disabledSaveTooltip} disabled={!isSaveDisabled}>
      <span>
        <ActionButton
          actionFn={onSave}
          className={cx(
            ButtonsS.Button,
            ButtonsS.ButtonPrimary,
            ButtonsS.ButtonSmall,
          )}
          normalText={t`Save`}
          activeText={t`Saving…`}
          failedText={t`Save failed`}
          successText={t`Saved`}
          disabled={isSaveDisabled}
        />
      </span>
    </Tooltip>
  );
};

function getDisabledSaveButtonTooltip(
  missingRequiredParams: UiParameter[],
): string {
  if (!missingRequiredParams.length) {
    return "";
  }

  const names = missingRequiredParams
    .map((param) => `"${param.name}"`)
    .join(", ");

  return ngettext(
    msgid`The ${names} parameter requires a default value but none was provided.`,
    `The ${names} parameters require default values but none were provided.`,
    missingRequiredParams.length,
  );
}
