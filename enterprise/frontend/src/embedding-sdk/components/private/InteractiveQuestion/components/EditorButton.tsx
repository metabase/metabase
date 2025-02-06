import { useInteractiveQuestionContext } from "embedding-sdk/components/private/InteractiveQuestion/context";
import { QuestionNotebookButton } from "metabase/query_builder/components/view/ViewHeader/components";
import { ActionIcon, type ActionIconProps, Icon } from "metabase/ui";

import S from "./EditorButton.module.css";
export const EditorButton = ({
  isOpen,
  ...actionIconProps
}: {
  isOpen: boolean;
} & ActionIconProps) => {
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
