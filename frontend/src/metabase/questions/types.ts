/* flow */

import type { Collection } from "metabase-types/types/Collection";
import type { Label } from "metabase-types/types/Label";

export type Entity = {
  id: number,
};

export type Item = {
  entity: Entity,
  id: number,
  name: string,
  description: string,
  created?: string | null,
  by?: string | null,
  icon?: string | null,
  favorite: boolean,
  archived: boolean,
  selected: boolean,
  visible: boolean,
  collection: Collection,
  labels: Label[],
};
