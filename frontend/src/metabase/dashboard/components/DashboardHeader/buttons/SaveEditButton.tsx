import cx from "classnames";
import { msgid, ngettext, t } from "ttag";

import { ActionButton } from "metabase/common/components/ActionButton";
import ButtonsS from "metabase/css/components/buttons.module.css";
import { useDashboardContext } from "metabase/dashboard/context/context";
import { getMissingRequiredParameters } from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { useRegisterShortcut } from "metabase/palette/hooks/useRegisterShortcut";
import { dismissAllUndo } from "metabase/redux/undo";
import { Tooltip } from "metabase/ui";
import type { UiParameter } from "metabase-lib/v1/parameters/types";

export const SaveEditButton = () => {
  const dispatch = useDispatch();
  const {
    setEditingDashboard,
    updateDashboardAndCards,
    onRefreshPeriodChange,
  } = useDashboardContext();

  const missingRequiredParameters = useSelector(getMissingRequiredParameters);

  const disabledSaveTooltip = getDisabledSaveButtonTooltip(
    missingRequiredParameters,
  );
  const isSaveDisabled = missingRequiredParameters.length > 0;

  const handleDoneEditing = () => {
    onRefreshPeriodChange(null);
    setEditingDashboard(null);
  };

  const onSave = async () => {
    // optimistically dismissing all the undos before the saving has finished
    // clicking on them wouldn't do anything at this moment anyway
    dispatch(dismissAllUndo());
    await updateDashboardAndCards();

    handleDoneEditing();
  };

  useRegisterShortcut([
    {
      id: "dashboard-save",
      perform: onSave,
    },
  ]);

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
