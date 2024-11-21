import S from "embedding-sdk/components/private/InteractiveQuestion/components/Picker.module.css";
import {
  type UpdateQueryHookProps,
  useBreakoutQueryHandlers,
} from "metabase/query_builder/hooks";
import { BreakoutPopover } from "metabase/querying/notebook/components/BreakoutStep";
import type * as Lib from "metabase-lib";

import { useInteractiveQuestionContext } from "../../../context";
import type { SDKBreakoutItem } from "../use-breakout-data";

export const BreakoutPickerInner = ({
  breakoutItem,
  onClose,
  query,
  onQueryChange,
  stageIndex,
}: {
  breakoutItem?: SDKBreakoutItem;
  onClose?: () => void;
} & UpdateQueryHookProps) => {
  const { onAddBreakout } = useBreakoutQueryHandlers({
    query,
    onQueryChange,
    stageIndex,
  });

  return (
    <BreakoutPopover
      className={S.PickerContainer}
      query={query}
      stageIndex={stageIndex}
      breakout={breakoutItem?.breakout}
      breakoutIndex={breakoutItem?.breakoutIndex}
      onAddBreakout={onAddBreakout}
      onUpdateBreakoutColumn={(_, column) =>
        breakoutItem?.updateBreakout(column)
      }
      onClose={() => onClose?.()}
      isMetric={false}
    />
  );
};

export const BreakoutPicker = ({
  onClose,
  breakoutItem,
}: {
  onClose?: () => void;
  breakoutItem?: SDKBreakoutItem;
}) => {
  const { question, updateQuestion } = useInteractiveQuestionContext();

  if (!question) {
    return null;
  }

  const query = question.query();
  const stageIndex = -1;

  const onQueryChange = (query: Lib.Query) => {
    if (question) {
      updateQuestion(question.setQuery(query), { run: true });
    }
  };

  return (
    <BreakoutPickerInner
      onClose={onClose}
      breakoutItem={breakoutItem}
      query={query}
      onQueryChange={onQueryChange}
      stageIndex={stageIndex}
    />
  );
};
