import { createEntity, undo } from "metabase/lib/entities";
import { color } from "metabase/lib/colors";
import { normalizedCollection } from "metabase/entities/collections";
import { canonicalCollectionId } from "metabase/collections/utils";
import { Dispatch } from "metabase-types/store";

type Opts = Record<string, any>;

type MetricModel = {
  description: string | null;
  entity_id: string | null;
  model: "newmetric";
  name: string;
  id: number;
  collection?: unknown;
};

const NewMetrics = createEntity({
  name: "newMetrics",
  nameOne: "newMetric",
  nameMany: "newMetrics",
  path: "/api/newmetric",

  selectors: {
    getObject: (state: any, { entityId }: { entityId: number }) => {
      return state.entities.newMetrics[entityId];
    },
  },

  objectActions: {
    setArchived: ({ id }: { id: number }, archived: boolean, opts: Opts) => {
      return NewMetrics.actions.update(
        { id },
        { archived },
        undo(opts, "metric", archived ? "archived" : "unarchived"),
      );
    },

    setCollection: (
      { id }: { id: number },
      collection: { id: number } | null | undefined,
      opts: Opts,
    ) => {
      return NewMetrics.actions.update(
        { id },
        { collection_id: canonicalCollectionId(collection?.id) },
        undo(opts, "metric", "moved"),
      );
    },

    setPinned: ({ id }: { id: number }, pinned: boolean, opts: Opts) => {
      return NewMetrics.actions.update(
        { id },
        {
          collection_position:
            typeof pinned === "number" ? pinned : pinned ? 1 : null,
        },
        opts,
      );
    },

    // setCollectionPreview: ({ id }, collection_preview, opts) =>
    //   NewMetrics.actions.update({ id }, { collection_preview }, opts),
  },

  objectSelectors: {
    getName: (metric: MetricModel) => metric?.name,
    getUrl: (metric: MetricModel) => `/metric/${metric.id}`,
    getColor: () => color("text-medium"),
    getCollection: (metric: MetricModel) => {
      return metric && normalizedCollection(metric.collection);
    },
    getIcon: () => ({ name: "star" }),
  },
});

export default NewMetrics;
