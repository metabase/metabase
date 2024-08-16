import { useInteractiveQuestionContext } from "embedding-sdk/components/private/InteractiveQuestion/context";
import { Button } from "metabase/ui";
import * as Lib from "metabase-lib";

export const SaveButton = ({ onClick }: { onClick?: () => void } = {}) => {
  const { question } = useInteractiveQuestionContext();

  const canSave = question && Lib.canSave(question.query(), question.type());

  return (
    <Button disabled={!canSave} onClick={onClick}>
      Save
    </Button>
  );
};
