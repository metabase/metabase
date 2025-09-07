import { useRegisterMetabotContextProvider } from "metabase/metabot";
import type { MetabotTransformInfo, Transform } from "metabase-types/api";

export const useRegisterTransformMetabotContext = (
  transform: Transform | undefined,
) => {
  useRegisterMetabotContextProvider(async () => {
    if (!transform) {
      return {};
    }
    const transformInfo: MetabotTransformInfo = {
      type: "transform",
      id: transform.id,
      name: transform.name,
      description: transform.description,
      source: transform.source,
      target: transform.target,
      last_run: transform.last_run,
      table: transform.table,
      entity_id: (transform as any).entity_id,
      created_at: transform.created_at,
      updated_at: transform.updated_at,
      tag_ids: transform.tag_ids,
    };

    return {
      user_is_viewing: [transformInfo],
    };
  }, [transform]);
};
