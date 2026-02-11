import { t } from "ttag";

import {
  type SDKBreakoutItem,
  useBreakoutData,
} from "embedding-sdk-bundle/components/private/SdkQuestion/components/Breakout/use-breakout-data";
import { useSdkQuestionContext } from "embedding-sdk-bundle/components/private/SdkQuestion/context";
import { useLocale } from "metabase/common/hooks";
import { useTranslateContent } from "metabase/i18n/hooks";
import { PLUGIN_CONTENT_TRANSLATION } from "metabase/plugins";

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
  const tc = useTranslateContent();
  const { locale } = useLocale();

  return (
    <BadgeList
      items={breakoutItems.map((item) => ({
        item,
        name: PLUGIN_CONTENT_TRANSLATION.translateColumnDisplayName({
          displayName: item.longDisplayName,
          tc,
          locale,
        }),
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
