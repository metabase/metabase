import { useSelector } from "metabase/lib/redux";
import { getUiControls } from "metabase/query_builder/selectors";
import { useNotebookNativePreview } from "metabase/querying/notebook/components/NotebookNativePreview";
import { Button } from "metabase/ui";

const ConvertToNativeQuestionButton = () => {
  const { isShowingNotebookNativePreview } = useSelector(getUiControls);
  const { handleConvertClick, showQuery, buttonTitle } =
    useNotebookNativePreview();

  if (!isShowingNotebookNativePreview) {
    return null;
  }

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
