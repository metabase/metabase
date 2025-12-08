import { trackSimpleEvent } from "metabase/lib/analytics";
import type { CollectionId, TableId } from "metabase-types/api";

export const trackDataStudioLibraryCreated = (id: CollectionId) => {
  trackSimpleEvent({
    event: "data_studio_library_created",
    target_id: Number(id),
  });
};

export const trackDataStudioTablePublished = (id: TableId | null) => {
  trackSimpleEvent({
    event: "data_studio_table_published",
    target_id: id != null ? Number(id) : null,
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
