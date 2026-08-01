import * as Urls from "metabase/urls";
import type { CollectionItem, CollectionItemModel } from "metabase-types/api";

const HOSTED_CARD_MODELS: CollectionItemModel[] = ["card", "dataset", "metric"];

/**
 * Where a collection item links to from inside Content Studio. Sub-collections,
 * questions, models and metrics stay in the studio; everything else opens on its
 * main app route.
 */
export function getContentStudioItemUrl(item: CollectionItem): string {
  if (item.model === "collection") {
    return Urls.contentStudioCollection(item);
  }

  if (HOSTED_CARD_MODELS.includes(item.model)) {
    return Urls.contentStudioQuestion({ id: item.id, name: item.name });
  }

  return Urls.modelToUrl(item);
}
