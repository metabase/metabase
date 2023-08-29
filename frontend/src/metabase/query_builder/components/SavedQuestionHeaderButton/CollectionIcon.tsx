import {
  PLUGIN_MODERATION,
  PLUGIN_COLLECTION_COMPONENTS,
} from "metabase/plugins";
import { color } from "metabase/lib/colors";

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

  return (
    <PLUGIN_COLLECTION_COMPONENTS.CollectionInstanceAnalyticsIcon
      color={color("brand")}
      collection={collection}
      entity={question.isDataset() ? "model" : "question"}
    />
  );
};
