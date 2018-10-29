import { createEntity, undo } from "metabase/lib/entities";
import * as Urls from "metabase/lib/urls";
import { normal } from "metabase/lib/colors";

import {
  canonicalCollectionId,
  getCollectionType,
} from "metabase/entities/collections";

const Pulses = createEntity({
  name: "pulses",
  path: "/api/pulse",

  objectActions: {
    setArchived: ({ id }, archived, opts) =>
      Pulses.actions.update(
        { id },
        { archived },
        undo(opts, "pulse", archived ? "archived" : "unarchived"),
      ),

    setCollection: ({ id }, collection, opts) =>
      Pulses.actions.update(
        { id },
        { collection_id: canonicalCollectionId(collection && collection.id) },
        undo(opts, "pulse", "moved"),
      ),

    setPinned: ({ id }, pinned, opts) =>
      Pulses.actions.update(
        { id },
        {
          collection_position:
            typeof pinned === "number" ? pinned : pinned ? 1 : null,
        },
        opts,
      ),
  },

  objectSelectors: {
    getName: pulse => pulse && pulse.name,
    getUrl: pulse => pulse && Urls.pulse(pulse.id),
    getIcon: pulse => "pulse",
    getColor: pulse => normal.yellow,
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

  getAnalyticsMetadata(action, object, getState) {
    const type = object && getCollectionType(object.collection_id, getState());
    return type && `collection=${type}`;
  },
});

export default Pulses;
