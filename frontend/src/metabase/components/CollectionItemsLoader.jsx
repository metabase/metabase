/* @flow */
import React from "react";
import EntityObjectLoader from "metabase/entities/containers/EntityObjectLoader";

type Props = {
  collectionId: number,
  children: () => void,
};

const CollectionItemsLoader = ({ collectionId, children }: Props) => (
  <EntityObjectLoader
    entityType="collections"
    entityId={collectionId}
    children={({ object }) =>
      object &&
      children({
        dashboards: object.dashboards,
        cards: object.cards,
        pulses: object.pulses,
        allItems: [].concat(
          object.cards.map(c => ({ ...c, type: "card" })),
          object.dashboards.map(d => ({ ...d, type: "dashboard" })),
          object.pulses.map(p => ({ ...p, type: "pulse" })),
        ),
        empty:
          object.dashboards.length === 0 &&
          object.cards.length === 0 &&
          object.pulses.length,
      })
    }
  />
);

export default CollectionItemsLoader;
