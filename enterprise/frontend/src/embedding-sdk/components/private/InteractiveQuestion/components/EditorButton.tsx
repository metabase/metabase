import { useInteractiveQuestionContext } from "embedding-sdk/components/private/InteractiveQuestion/context";
import { QuestionNotebookButton } from "metabase/query_builder/components/view/ViewHeader/components";
import { ActionIcon, Icon } from "metabase/ui";

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
        c={isOpen ? "text-white" : "text-dark"}
        color="brand"
        variant={isOpen ? "filled" : "default"}
        onClick={onClick}
      >
        <Icon name="notebook" />
      </ActionIcon>
    )
  );
};
