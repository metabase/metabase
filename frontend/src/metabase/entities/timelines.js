import { t } from "ttag";
import { TimelineApi } from "metabase/services";
import { createEntity, undo } from "metabase/lib/entities";
import forms from "./timelines/forms";

const Timelines = createEntity({
  name: "timelines",
  nameOne: "timeline",
  path: "/api/timeline",
  forms,

  api: {
    list: async (params, ...args) => {
      if (params.cardId) {
        return TimelineApi.getCardTimelines(params, ...args);
      } else if (params.collectionId) {
        return TimelineApi.getCollectionTimelines(params, ...args);
      } else {
        return TimelineApi.getTimelines(params, ...args);
      }
    },
  },

  objectActions: {
    setArchived: ({ id }, archived, opts) =>
      Timelines.actions.update(
        { id },
        { archived },
        undo(opts, t`timeline`, archived ? t`archived` : t`unarchived`),
      ),
  },
});

export default Timelines;
