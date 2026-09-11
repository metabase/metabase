import { P, match } from "ts-pattern";

import { useGetTableQuery } from "metabase/api";
import { PLUGIN_LIBRARY } from "metabase/plugins";
import * as Urls from "metabase/urls";
import { getName } from "metabase/utils/name";
import type {
  CardId,
  Collection,
  MeasureId,
  SegmentId,
  Table,
  TableId,
} from "metabase-types/api";
import { isConcreteTableId } from "metabase-types/api";

import {
  entityToUrlableModel,
  isMentionableUser,
} from "../shared/suggestionUtils";
import type { SuggestionModel } from "../shared/types";

import { useEntityData } from "./use-entity-data";

export type SmartLinkEntityRef = {
  id: number;
  model: SuggestionModel;
};

export type LibraryEntityModel = "table" | "metric" | "measure" | "segment";

export type LibraryEntity = {
  model: LibraryEntityModel;
  id: TableId | CardId | MeasureId | SegmentId;
  name: string;
  description: string | null;
  collection: Collection | null | undefined;
  parentTable?: Table;
};

export type SmartLinkEntityInfo = {
  entityName?: string;
  href: string;
  isLoading: boolean;
  libraryEntity?: LibraryEntity;
};

type EntityData = ReturnType<typeof useEntityData>;

const getLibraryEntity = (
  data: EntityData,
  parentTable: Table | undefined,
): LibraryEntity | undefined =>
  match(data)
    .with({ model: "table", entity: { is_published: true } }, ({ entity }) => ({
      model: "table" as const,
      id: entity.id,
      name: entity.display_name,
      description: entity.description,
      collection: entity.collection,
    }))
    .with(
      {
        model: P.union("card", "dataset", "metric"),
        entity: {
          type: "metric",
          collection: { type: P.when(PLUGIN_LIBRARY.isLibraryCollectionType) },
        },
      },
      ({ entity }) => ({
        model: "metric" as const,
        id: entity.id,
        name: entity.name,
        description: entity.description,
        collection: entity.collection,
      }),
    )
    .with({ model: "measure", entity: P.nonNullable }, ({ entity }) =>
      parentTable?.is_published
        ? {
            model: "measure" as const,
            id: entity.id,
            name: entity.name,
            description: entity.description,
            collection: parentTable.collection,
            parentTable,
          }
        : undefined,
    )
    .with({ model: "segment", entity: P.nonNullable }, ({ entity }) =>
      parentTable?.is_published
        ? {
            model: "segment" as const,
            id: entity.id,
            name: entity.name,
            description: entity.description,
            collection: parentTable.collection,
            parentTable,
          }
        : undefined,
    )
    .otherwise(() => undefined);

const getEntityHref = (
  data: EntityData,
  parentTable: Table | undefined,
): string | undefined =>
  match(data)
    .with({ model: "table", entity: P.nonNullable }, ({ entity }) =>
      isConcreteTableId(entity.id)
        ? Urls.table({ id: entity.id, name: entity.display_name })
        : Urls.modelToUrl(entityToUrlableModel(entity, "table")),
    )
    .with({ model: "measure", entity: P.nonNullable }, ({ entity }) =>
      Urls.dataStudioPublishedTableMeasure(entity.table_id, entity.id),
    )
    .with({ model: "segment", entity: P.nonNullable }, ({ entity }) =>
      parentTable
        ? Urls.tableRowsQuery(
            parentTable.db_id,
            entity.table_id,
            undefined,
            entity.id,
          )
        : undefined,
    )
    .with({ entity: P.nonNullable }, ({ model, entity }) =>
      Urls.modelToUrl(entityToUrlableModel(entity, model)),
    )
    .otherwise(() => undefined);

export function useSmartLinkEntity({
  id,
  model,
  href: fallbackHref,
}: SmartLinkEntityRef & { href?: string }): SmartLinkEntityInfo {
  const data = useEntityData(id, model);
  const { entity, isLoading } = data;
  const parentTableId = match(data)
    .with(
      { model: P.union("measure", "segment"), entity: P.nonNullable },
      ({ entity }) => entity.table_id,
    )
    .otherwise(() => undefined);
  const { data: parentTable } = useGetTableQuery(
    { id: parentTableId! },
    { skip: parentTableId == null },
  );

  return {
    entityName: isMentionableUser(entity)
      ? entity.common_name
      : getName(entity),
    href: getEntityHref(data, parentTable) || fallbackHref || "",
    isLoading,
    libraryEntity: getLibraryEntity(data, parentTable),
  };
}
