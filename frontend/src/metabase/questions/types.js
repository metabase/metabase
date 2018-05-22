/* flow */

import type { Collection } from "metabase/meta/types/Collection";

export type Entity = {
  id: number,
};

export type Item = {
  entity: Entity,
  id: number,
  name: string,
  description: string,
  created: ?string,
  by: ?string,
  icon: ?string,
  favorite: boolean,
  archived: boolean,
  selected: boolean,
  visible: boolean,
  collection: Collection,
  labels: Label[],
};
