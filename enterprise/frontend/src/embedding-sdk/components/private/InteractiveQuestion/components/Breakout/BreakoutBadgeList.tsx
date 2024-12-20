import { t } from "ttag";

import {
  type SDKBreakoutItem,
  useBreakoutData,
} from "embedding-sdk/components/private/InteractiveQuestion/components/Breakout/use-breakout-data";
import { useInteractiveQuestionContext } from "embedding-sdk/components/private/InteractiveQuestion/context";
import type { QuestionStateParams } from "embedding-sdk/types/question";

import { BadgeList } from "../util/BadgeList";

export const BreakoutBadgeListInner = ({
  question,
  updateQuestion,
  onSelectItem,
  onAddItem,
  onRemoveItem,
}: QuestionStateParams & {
  onSelectItem: (item: SDKBreakoutItem, index: number) => void;
  onAddItem: (item: SDKBreakoutItem | undefined) => void;
  onRemoveItem: (item: SDKBreakoutItem, index: number) => void;
}) => {
  const breakoutItems = useBreakoutData({ question, updateQuestion });

  return (
    <BadgeList
      items={breakoutItems.map(item => ({ item, name: item.longDisplayName }))}
      addButtonLabel={t`Add another grouping`}
      onSelectItem={onSelectItem}
      onAddItem={onAddItem}
      onRemoveItem={onRemoveItem}
    />
  );
};

export const BreakoutBadgeList = ({
  onSelectItem,
  onAddItem,
  onRemoveItem,
}: {
  onSelectItem: (item: SDKBreakoutItem, index: number) => void;
  onAddItem: (item: SDKBreakoutItem | undefined) => void;
  onRemoveItem: (item: SDKBreakoutItem, index: number) => void;
}) => {
  const { question, updateQuestion } = useInteractiveQuestionContext();

  if (!question) {
    return null;
  }

  return (
    <BreakoutBadgeListInner
      question={question}
      updateQuestion={updateQuestion}
      onSelectItem={onSelectItem}
      onAddItem={onAddItem}
      onRemoveItem={onRemoveItem}
    />
  );
};
