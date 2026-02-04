import type { HTMLAttributes, MouseEventHandler } from "react";
import { t } from "ttag";

import { useSdkQuestionContext } from "embedding-sdk-bundle/components/private/SdkQuestion/context";
import type { ActionIconProps } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import { SdkActionIcon } from "../util/SdkActionIcon";

/**
 * @interface
 * @expand
 * @category InteractiveQuestion
 */
export type EditorButtonProps = {
  /**
   * Whether the editor is currently open
   * @defaultValue false
   */
  isOpen?: boolean;

  /**
   * Callback function to be called when the button is clicked
   */
  onClick?: MouseEventHandler<HTMLButtonElement>;
} & ActionIconProps &
  HTMLAttributes<HTMLButtonElement>;

function shouldShowEditButton({
  question,
  isActionListVisible,
  isBrandNew = false,
}: {
  question: Question;
  isActionListVisible: boolean;
  isBrandNew?: boolean;
}) {
  const { isEditable } = Lib.queryDisplayInfo(question.query());
  return (
    isEditable && isActionListVisible && !question.isArchived() && !isBrandNew
  );
}

/**
 * Toggle button for showing/hiding the Editor interface.
 * In custom layouts, the `EditorButton` _must_ have an {@link InteractiveQuestionEditorButtonProps.onClick}` handler or the button won't do anything when clicked.
 *
 * @function
 * @category InteractiveQuestion
 * @param props
 */
export const EditorButton = ({
  isOpen = false,
  ...actionIconProps
}: EditorButtonProps) => {
  const { question } = useSdkQuestionContext();
  return (
    question &&
    shouldShowEditButton({
      question,
      isActionListVisible: true,
    }) && (
      <SdkActionIcon
        tooltip={t`Edit question`}
        icon="pencil_lines"
        data-testid="notebook-button"
        data-active={isOpen}
        {...actionIconProps}
      />
    )
  );
};
