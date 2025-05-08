import type { HTMLAttributes, MouseEventHandler } from "react";

import { useInteractiveQuestionContext } from "embedding-sdk/components/private/InteractiveQuestion/context";
import { QuestionNotebookButton } from "metabase/query_builder/components/view/ViewHeader/components";
import { ActionIcon, type ActionIconProps, Icon } from "metabase/ui";

import S from "./EditorButton.module.css";

/**
 * @interface
 * @expand
 * @category InteractiveQuestion
 */
export type InteractiveQuestionEditorButtonProps = {
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
}: InteractiveQuestionEditorButtonProps) => {
  const { question } = useInteractiveQuestionContext();
  return (
    question &&
    QuestionNotebookButton.shouldRender({
      question,
      isActionListVisible: true,
    }) && (
      <ActionIcon
        data-testid="notebook-button"
        size="lg"
        className={S.EditorButton}
        data-active={isOpen}
        variant="default"
        {...actionIconProps}
      >
        <Icon name="pencil_lines" />
      </ActionIcon>
    )
  );
};
