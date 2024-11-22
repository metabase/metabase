import { useNotebookNativePreview } from "metabase/querying/notebook/components/NotebookNativePreview";
import { Button } from "metabase/ui";

const ConvertToNativeQuestionButton = () => {
  const { handleConvertClick, showQuery, buttonTitle } =
    useNotebookNativePreview();

  return (
    <Button
      variant="subtle"
      p="xs"
      onClick={handleConvertClick}
      disabled={!showQuery}
    >
      {buttonTitle}
    </Button>
  );
};

export { ConvertToNativeQuestionButton };
