import _ from "underscore";

import Collections from "metabase/entities/collections";

import type {
  Collection,
  RegularCollectionId,
  DataApp,
  DataAppId,
} from "metabase-types/api";
import type { ReduxAction } from "metabase-types/store";

type CollectionUpdateActionPayload = {
  collection: Collection;
  object: Collection;
  entities: {
    collections: Record<RegularCollectionId, Collection>;
  };
};

type NormalizedDataApp = Omit<DataApp, "collection">;
type DataAppsState = {
  [id: DataAppId]: NormalizedDataApp;
};

function reducer(
  state: DataAppsState = {},
  { type, payload, error }: ReduxAction,
) {
  if (type === Collections.actionTypes.UPDATE && !error) {
    const { collection } = payload as CollectionUpdateActionPayload;

    if (collection.archived) {
      const apps = Object.values(state);
      const app = _.findWhere(apps, { collection_id: collection.id as number });
      return app ? _.omit(state, app.id as any) : state;
    }
  }

  return state;
}

export default reducer;
