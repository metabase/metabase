import { t } from "ttag";

import {
  type UpdateQueryHookProps,
  useBreakoutQueryHandlers,
} from "metabase/query_builder";
import { BreakoutPopover } from "metabase/querying/notebook/components/BreakoutStep";
import { Divider, PopoverBackButton, Stack } from "metabase/ui";
import type * as Lib from "metabase-lib";

import { useSdkQuestionContext } from "../../../context";
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
    <Stack gap={0} w="18.75rem">
      <PopoverBackButton px="lg" py="md" h="auto" onClick={() => onClose?.()}>
        {breakoutItem?.displayName ?? t`Back`}
      </PopoverBackButton>
      <Divider />
      <BreakoutPopover
        query={query}
        stageIndex={stageIndex}
        breakout={breakoutItem?.breakout}
        breakoutIndex={breakoutItem?.breakoutIndex}
        onAddBreakout={onAddBreakout}
        onUpdateBreakoutColumn={(_, column) =>
          breakoutItem?.updateBreakout(column)
        }
        onClose={() => onClose?.()}
      />
    </Stack>
  );
};

export const BreakoutPicker = ({
  onClose,
  breakoutItem,
}: {
  onClose?: () => void;
  breakoutItem?: SDKBreakoutItem;
}) => {
  const {
    question,
    updateAndNormalizeQuestion,
    lastVisibleStageIndex: stageIndex,
  } = useSdkQuestionContext();

  if (!question) {
    return null;
  }

  const query = question.query();

  const onQueryChange = (nextQuery: Lib.Query) => {
    if (question) {
      updateAndNormalizeQuestion(question.setQuery(nextQuery), { run: true });
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
