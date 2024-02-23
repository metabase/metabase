import slugg from "slugg";

import type { IndexedEntity } from "metabase-types/api";

export const indexedEntity = (entity: IndexedEntity) =>
  `/model/${entity.model_id}-${slugg(entity.model_name)}/${entity.id}`;
