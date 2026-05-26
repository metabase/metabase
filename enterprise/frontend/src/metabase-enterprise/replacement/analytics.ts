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

export function trackModelToTransformsMigrationStarted({
  cardId,
}: {
  cardId: CardId;
}) {
  trackSimpleEvent({
    event: "model_to_transforms_migration_started",
    target_id: cardId,
  });
}

export function trackModelToTransformsMigrationSuccess({
  cardId,
}: {
  cardId: CardId;
}) {
  trackSimpleEvent({
    event: "model_to_transforms_migration_success",
    target_id: cardId,
  });
}

export function trackModelToTransformsMigrationFailure({
  cardId,
}: {
  cardId: CardId;
}) {
  trackSimpleEvent({
    event: "model_to_transforms_migration_failure",
    target_id: cardId,
  });
}

export function trackReplaceDataSourceStarted({
  triggeredFrom,
}: {
  triggeredFrom: SourceReplacementTriggeredFrom;
}) {
  trackSimpleEvent({
    event: "replace_data_source_started",
    triggered_from: triggeredFrom,
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

export function trackReplaceDataSourceSucceeded({
  triggeredFrom,
}: {
  triggeredFrom: SourceReplacementTriggeredFrom;
}) {
  trackSimpleEvent({
    event: "replace_data_source_succeeded",
    triggered_from: triggeredFrom,
  });
}
