import { trackSimpleEvent } from "metabase/analytics";
import type { SourceReplacementTriggeredFrom } from "metabase/plugins";
import type { CardId } from "metabase-types/api";

export function trackModelToTransformsMigrationModalOpened({
  cardId,
}: {
  cardId: CardId;
}) {
  trackSimpleEvent({
    event: "model_to_transforms_migration_modal_opened",
    target_id: cardId,
  });
}

export function trackReplaceDataSourceConfirmed({
  triggeredFrom,
}: {
  triggeredFrom: SourceReplacementTriggeredFrom;
}) {
  trackSimpleEvent({
    event: "replace_data_source_confirmed",
    triggered_from: triggeredFrom,
  });
}
