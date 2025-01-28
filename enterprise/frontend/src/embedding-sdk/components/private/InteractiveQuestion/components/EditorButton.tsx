import { useInteractiveQuestionContext } from "embedding-sdk/components/private/InteractiveQuestion/context";
import { QuestionNotebookButton } from "metabase/query_builder/components/view/ViewHeader/components";
import { ActionIcon, Icon } from "metabase/ui";

import S from "./EditorButton.module.css";
export const EditorButton = ({
  isOpen,
  onClick,
}: {
  isOpen: boolean;
  onClick: () => void;
}) => {
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
        onClick={onClick}
        className={S.EditorButton}
        data-active={isOpen}
        variant="default"
      >
        <Icon name="pencil_lines" />
      </ActionIcon>
    )
  );
};
