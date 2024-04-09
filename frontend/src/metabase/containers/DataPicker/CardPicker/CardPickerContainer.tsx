import { useCallback, useMemo } from "react";
import { connect } from "react-redux";
import _ from "underscore";

import Collections from "metabase/entities/collections";
import Schemas from "metabase/entities/schemas";
import { getUser } from "metabase/selectors/user";
import type Schema from "metabase-lib/v1/metadata/Schema";
import type Table from "metabase-lib/v1/metadata/Table";
import { getCollectionVirtualSchemaId } from "metabase-lib/v1/metadata/utils/saved-questions";
import type { Collection, User } from "metabase-types/api";
import type { State } from "metabase-types/store";

import type { DataPickerProps, DataPickerSelectedItem } from "../types";
import useSelectedTables from "../useSelectedTables";

import CardPickerView from "./CardPickerView";
import { buildCollectionTree } from "./utils";

interface CardPickerOwnProps extends DataPickerProps {
  targetModel: "model" | "question";
  isMultiSelect?: boolean;
  onBack?: () => void;
}

interface CardPickerStateProps {
  currentUser: User;
}

interface CollectionsLoaderProps {
  collectionTree: Collection[];
  collections: Collection[];
  rootCollection?: Collection;
  allLoading: boolean;
}

interface SchemaLoaderProps {
  schema?: Schema;
}

type CardPickerProps = CardPickerOwnProps &
  CardPickerStateProps &
  CollectionsLoaderProps &
  SchemaLoaderProps;

function mapStateToProps(state: State) {
  return {
    currentUser: getUser(state),
  };
}

function CardPickerContainer({
  value,
  collections,
  collectionTree,
  rootCollection,
  schema: selectedSchema,
  currentUser,
  targetModel,
  isMultiSelect,
  allLoading,
  onChange,
  onBack,
}: CardPickerProps) {
  const { collectionId } = value;

  const { selectedTableIds, toggleTableIdSelection } = useSelectedTables({
    initialValues: value.tableIds,
    isMultiSelect,
  });

  const collectionsMap = useMemo(
    () => _.indexBy(collections, "id"),
    [collections],
  );

  const tree = useMemo(
    () =>
      buildCollectionTree({
        collections: collectionTree,
        rootCollection,
        currentUser,
        targetModel,
      }),
    [collectionTree, rootCollection, currentUser, targetModel],
  );

  const selectedItems = useMemo(() => {
    const items: DataPickerSelectedItem[] = [];

    if (collectionId) {
      items.push({ type: "collection", id: collectionId });
    }

    const tables: DataPickerSelectedItem[] = selectedTableIds.map(id => ({
      type: "table",
      id,
    }));

    items.push(...tables);

    return items;
  }, [collectionId, selectedTableIds]);

  const handleSelectedCollectionChange = useCallback(
    (id: Collection["id"]) => {
      const collection = id === "root" ? rootCollection : collectionsMap[id];
      if (collection) {
        const schemaId = getCollectionVirtualSchemaId(collection, {
          isDatasets: targetModel === "model",
        });
        onChange({ ...value, schemaId, collectionId: id, tableIds: [] });
      }
    },
    [value, collectionsMap, rootCollection, targetModel, onChange],
  );

  const handleSelectedTablesChange = useCallback(
    (tableId: Table["id"]) => {
      const tableIds = toggleTableIdSelection(tableId);
      onChange({ ...value, tableIds });
    },
    [value, toggleTableIdSelection, onChange],
  );

  return (
    <CardPickerView
      collectionTree={tree}
      virtualTables={selectedSchema?.tables}
      selectedItems={selectedItems}
      targetModel={targetModel}
      isLoading={allLoading}
      onSelectCollection={handleSelectedCollectionChange}
      onSelectedVirtualTable={handleSelectedTablesChange}
      onBack={onBack}
    />
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  Collections.load({
    id: "root",
    entityAlias: "rootCollection",
    loadingAndErrorWrapper: false,
  }),
  Collections.loadList({
    query: () => ({ tree: true, "exclude-archived": true }),
    listName: "collectionTree",
  }),
  Collections.loadList({
    listName: "collections",
  }),
  Schemas.load({
    id: (state: State, props: CardPickerOwnProps) => props.value.schemaId,
    loadingAndErrorWrapper: false,
  }),
  connect(mapStateToProps),
)(CardPickerContainer);
