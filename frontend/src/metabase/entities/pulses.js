import { t } from "ttag";
import { createEntity, undo } from "metabase/lib/entities";
import * as Urls from "metabase/lib/urls";
import { color } from "metabase/lib/colors";

import {
  canonicalCollectionId,
  getCollectionType,
} from "metabase/entities/collections";

const Pulses = createEntity({
  name: "pulses",
  nameOne: "pulse",
  path: "/api/pulse",

  objectActions: {
    setArchived: ({ id }, archived, opts) => {
      return Pulses.actions.update(
        { id },
        { archived },
        undo(opts, t`subscription`, archived ? t`archived` : t`unarchived`),
      );
    },

    setCollection: ({ id }, collection, opts) => {
      return Pulses.actions.update(
        { id },
        { collection_id: canonicalCollectionId(collection && collection.id) },
        undo(opts, t`subscription`, t`moved`),
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

    unsubscribe: ({ id, channels }, user, opts) => {
      const newChannels = channels.map(channel => ({
        ...channel,
        recipients: channel.recipients.filter(
          recipient => recipient.id !== user.id,
        ),
      }));

      return Pulses.actions.update(
        { id },
        { channels: newChannels },
        undo(opts, "", t`unsubscribed`),
      );
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
