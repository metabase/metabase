import type {
  BaseEntityId,
  CardId,
  CollectionId,
  DashboardId,
} from "metabase-types/api";

export type SUPPORTED_ENTITIES = {
  dashboard: DashboardId;
  card: CardId;
  collection: CollectionId;
};

export type ValidatedEntityIdProps<
  TEntity extends keyof SUPPORTED_ENTITIES = keyof SUPPORTED_ENTITIES,
> = {
  type: TEntity;
  id: BaseEntityId | string | number | null | undefined;
};

export type ValidatedEntityIdReturned<
  TEntity extends keyof SUPPORTED_ENTITIES,
  TReturnedId = SUPPORTED_ENTITIES[TEntity] | null,
> =
  | { id: TReturnedId; isLoading?: false; isError: false }
  | {
      id: null;
      isLoading?: boolean;
      isError: boolean;
    };
