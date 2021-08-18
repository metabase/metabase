import { createEntity, undo } from "metabase/lib/entities";
import { PulseApi } from "metabase/services";
import * as Urls from "metabase/lib/urls";
import { color } from "metabase/lib/colors";

import {
  canonicalCollectionId,
  getCollectionType,
} from "metabase/entities/collections";

export const UNSUBSCRIBE = "metabase/entities/pulses/UNSUBSCRIBE";

const Pulses = createEntity({
  name: "pulses",
  path: "/api/pulse",

  actionTypes: {
    UNSUBSCRIBE,
  },

  objectActions: {
    setArchived: ({ id }, archived, opts) => {
      return Pulses.actions.update(
        { id },
        { archived },
        undo(opts, "pulse", archived ? "archived" : "unarchived"),
      );
    },

    setCollection: ({ id }, collection, opts) => {
      return Pulses.actions.update(
        { id },
        { collection_id: canonicalCollectionId(collection && collection.id) },
        undo(opts, "pulse", "moved"),
      );
    },

    setPinned: ({ id }, pinned, opts) => {
      return Pulses.actions.update(
        { id },
        {
          collection_position:
            typeof pinned === "number" ? pinned : pinned ? 1 : null,
        },
        opts,
      );
    },

    unsubscribe: async ({ id }) => {
      await PulseApi.unsubscribe({ id });
      return { type: UNSUBSCRIBE };
    },
  },

  objectSelectors: {
    getName: pulse => pulse && pulse.name,
    getUrl: pulse => pulse && Urls.pulse(pulse.id),
    getIcon: pulse => ({ name: "pulse" }),
    getColor: pulse => color("pulse"),
  },

  form: {
    fields: [
      { name: "name" },
      {
        name: "collection_id",
        title: "Collection",
        type: "collection",
      },
    ],
  },

  getAnalyticsMetadata([object], { action }, getState) {
    const type = object && getCollectionType(object.collection_id, getState());
    return type && `collection=${type}`;
  },
});

export default Pulses;
