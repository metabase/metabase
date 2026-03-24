import * as Lib from "metabase-lib";
import type { CardType } from "metabase-types/api";

export function canRunQuery(query: Lib.Query, cardType: CardType) {
  const { isNative } = Lib.queryDisplayInfo(query);

  if (isNative) {
    const databaseId = Lib.databaseID(query);
    const hasDatabaseId = databaseId != null;

    const queryText = Lib.rawNativeQuery(query);
    const hasQueryText = queryText.length > 0;

    const tagErrors = Lib.validateTemplateTags(query);
    const hasNoTemplateTagErrors = tagErrors.length === 0;

    return hasQueryText && hasNoTemplateTagErrors && hasDatabaseId;
  }

  return Lib.canRun(query, cardType);
}
