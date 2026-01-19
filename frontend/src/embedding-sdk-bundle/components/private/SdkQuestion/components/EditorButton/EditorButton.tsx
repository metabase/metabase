import type { HTMLAttributes, MouseEventHandler } from "react";
import { t } from "ttag";

import { useSdkQuestionContext } from "embedding-sdk-bundle/components/private/SdkQuestion/context";
import { QuestionNotebookButton } from "metabase/query_builder/components/view/ViewHeader/components";
import type { ActionIconProps } from "metabase/ui";

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
    QuestionNotebookButton.shouldRender({
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
