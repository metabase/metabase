import { t } from "ttag";

import {
  type SDKBreakoutItem,
  useBreakoutData,
} from "embedding-sdk/components/private/SdkQuestion/components/Breakout/use-breakout-data";
import { useSdkQuestionContext } from "embedding-sdk/components/private/SdkQuestion/context";

import { BadgeList } from "../util/BadgeList";

export const BreakoutBadgeListInner = ({
  onSelectItem,
  onAddItem,
  onRemoveItem,
}: {
  onSelectItem: (item: SDKBreakoutItem, index: number) => void;
  onAddItem: (item: SDKBreakoutItem | undefined) => void;
  onRemoveItem: (item: SDKBreakoutItem, index: number) => void;
}) => {
  const breakoutItems = useBreakoutData();

  return (
    <BadgeList
      items={breakoutItems.map((item) => ({
        item,
        name: item.longDisplayName,
      }))}
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
  const { question } = useSdkQuestionContext();

  if (!question) {
    return null;
  }

  return (
    <BreakoutBadgeListInner
      onSelectItem={onSelectItem}
      onAddItem={onAddItem}
      onRemoveItem={onRemoveItem}
    />
  );
};
