import { trackSimpleEvent } from "metabase/lib/analytics";
import type { DataStudioOpenedEvent } from "metabase-types/analytics";
import type { CollectionId } from "metabase-types/api";

export const trackDataStudioOpened = (
  from: DataStudioOpenedEvent["triggered_from"],
) => {
  trackSimpleEvent({
    event: "data_studio_opened",
    triggered_from: from,
  });
};

export const trackDataStudioLibraryCreated = (id: CollectionId) => {
  trackSimpleEvent({
    event: "data_studio_library_created",
    target_id: Number(id),
  });
};

export const trackDataStudioLibraryModelCreated = (id: number | null) => {
  trackSimpleEvent({
    event: "data_studio_library_model_created",
    target_id: id,
  });
};

export const trackDataStudioLibraryMetricCreated = (id: number | null) => {
  trackSimpleEvent({
    event: "data_studio_library_metric_created",
    target_id: id,
  });
};

export const trackDataStudioTablePublished = (id: number | null) => {
  trackSimpleEvent({
    event: "data_studio_table_published",
    target_id: id,
  });
};

export const trackDataStudioDependencyGraphOpened = () => {
  trackSimpleEvent({
    event: "data_studio_dependency_graph_opened",
  });
};

export const trackDataStudioGlossaryTermCreated = (id: number | null) => {
  trackSimpleEvent({
    event: "data_studio_glossary_term_created",
    target_id: id,
  });
};

export const trackDataStudioGlossaryTermUpdated = (id: number | null) => {
  trackSimpleEvent({
    event: "data_studio_glossary_term_updated",
    target_id: id,
  });
};

export const trackDataStudioGlossaryTermDeleted = (id: number | null) => {
  trackSimpleEvent({
    event: "data_studio_glossary_term_deleted",
    target_id: id,
  });
};
