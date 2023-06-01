import { PLUGIN_MODERATION } from "metabase/plugins";
import {
  getCollectionIcon,
  getCollectionTooltip,
} from "metabase/entities/collections";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";

import type { Collection } from "metabase-types/api";
import type Question from "metabase-lib/Question";

// sometimes we want to show an icon on the question
// based on the collection it's in
export const CollectionIcon = ({
  collection,
  question,
}: {
  collection: Collection;
  question: Question;
}) => {
  if (!collection?.type) {
    return <PLUGIN_MODERATION.QuestionModerationIcon question={question} />;
  }

  const icon = getCollectionIcon(collection);
  const tooltip = getCollectionTooltip(
    collection,
    question.isDataset() ? "model" : "question",
  );

  if (!icon) {
    return null;
  }

  return <Icon name={icon.name} color={color("brand")} tooltip={tooltip} />;
};
