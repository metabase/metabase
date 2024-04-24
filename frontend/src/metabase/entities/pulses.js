import { t } from "ttag";

import { canonicalCollectionId } from "metabase/collections/utils";
import { getCollectionType } from "metabase/entities/collections";
import { color } from "metabase/lib/colors";
import { createEntity, undo } from "metabase/lib/entities";
import * as Urls from "metabase/lib/urls";
import { addUndo } from "metabase/redux/undo";
import { PulseApi } from "metabase/services";

export const UNSUBSCRIBE = "metabase/entities/pulses/unsubscribe";

/**
 * @deprecated use "metabase/api" instead
 */
const Pulses = createEntity({
  name: "pulses",
  nameOne: "pulse",
  path: "/api/pulse",

  actionTypes: {
    UNSUBSCRIBE,
  },

  api: {
    delete: () => {
      throw new TypeError("Pulses.api.delete is not supported");
    },
  },

  objectActions: {
    setArchived: ({ id }, archived, opts) => {
      return Pulses.actions.update(
        { id },
        { archived },
        undo(opts, t`subscription`, archived ? t`deleted` : t`restored`),
      );
    },

    setChannels: ({ id }, channels, opts) => {
      return Pulses.actions.update(
        { id },
        { channels },
        undo(opts, t`subscription`, t`updated`),
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

    unsubscribe:
      ({ id }) =>
      async dispatch => {
        await PulseApi.unsubscribe({ id });
        dispatch(addUndo({ message: t`Successfully unsubscribed` }));
        dispatch({ type: UNSUBSCRIBE, payload: { id } });
        dispatch({ type: Pulses.actionTypes.INVALIDATE_LISTS_ACTION });
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
