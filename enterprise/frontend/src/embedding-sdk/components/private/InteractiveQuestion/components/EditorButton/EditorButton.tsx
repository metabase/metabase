import type { HTMLAttributes } from "react";

import { useInteractiveQuestionContext } from "embedding-sdk/components/private/InteractiveQuestion/context";
import { QuestionNotebookButton } from "metabase/query_builder/components/view/ViewHeader/components";
import { ActionIcon, type ActionIconProps, Icon } from "metabase/ui";

import S from "./EditorButton.module.css";

/**
 * @interface
 * @remarks
 * Uses [Mantine ActionIcon props](https://v7.mantine.dev/core/action-icon/) under the hood
 */
export type InteractiveQuestionEditorButtonProps = {
  /**
   * Whether the editor is currently open
   */
  isOpen?: boolean;
} & ActionIconProps &
  HTMLAttributes<HTMLButtonElement>;

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
