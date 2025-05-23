import { color } from "metabase/lib/colors";
import {
  PLUGIN_COLLECTION_COMPONENTS,
  PLUGIN_MODERATION,
} from "metabase/plugins";
import type Question from "metabase-lib/v1/Question";
import type { Collection } from "metabase-types/api";

// sometimes we want to show an icon on the question
// based on the collection it's in
export const CollectionIcon = ({
  collection,
  question,
}: {
  collection: Collection | null | undefined;
  question: Question;
}) => {
  if (!collection?.type) {
    return <PLUGIN_MODERATION.EntityModerationIcon question={question} />;
  }

  return (
    <PLUGIN_COLLECTION_COMPONENTS.CollectionInstanceAnalyticsIcon
      color={color("brand")}
      collection={collection}
      entity={question.type()}
    />
  );
};
