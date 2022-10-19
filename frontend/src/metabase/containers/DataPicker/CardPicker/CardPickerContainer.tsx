/* eslint-disable react/prop-types */
import React, { useCallback, useMemo, useState } from "react";
import _ from "underscore";
import { connect } from "react-redux";

import Collections from "metabase/entities/collections";
import Schemas from "metabase/entities/schemas";

import { getUser } from "metabase/selectors/user";

import type { Collection, User } from "metabase-types/api";
import type { State } from "metabase-types/store";
import type Table from "metabase-lib/lib/metadata/Table";
import type Schema from "metabase-lib/lib/metadata/Schema";

import { getCollectionVirtualSchemaId } from "metabase-lib/lib/metadata/utils/saved-questions";

import type { DataPickerProps, DataPickerSelectedItem } from "../types";
import useSelectedTables from "../useSelectedTables";

import type { VirtualTable } from "./types";
import { buildCollectionTree } from "./utils";

import CardPickerView from "./CardPickerView";

interface CardPickerOwnProps extends DataPickerProps {
  targetModel: "model" | "question";
  onBack?: () => void;
}

interface CardPickerStateProps {
  currentUser: User;
}

interface CollectionsLoaderProps {
  collections: Collection[];
  rootCollection: Collection;
}

type CardPickerProps = CardPickerOwnProps &
  CardPickerStateProps &
  CollectionsLoaderProps;

function mapStateToProps(state: State) {
  return {
    currentUser: getUser(state),
  };
}

function CardPickerContainer({
  value,
  collections,
  rootCollection,
  currentUser,
  targetModel,
  onChange,
  onBack,
}: CardPickerProps) {
  const { schemaId } = value;

  const [selectedCollectionId, setSelectedCollectionId] = useState<
    Collection["id"] | undefined
  >();

  const { selectedTableIds, toggleTableIdSelection } = useSelectedTables({
    initialValues: value.tableIds,
    mode: "multiple",
  });

  const collectionsMap = useMemo(
    () => _.indexBy(collections, "id"),
    [collections],
  );

  const collectionTree = useMemo(
    () =>
      buildCollectionTree({
        collections,
        rootCollection,
        currentUser,
        targetModel,
      }),
    [collections, rootCollection, currentUser, targetModel],
  );

  const selectedItems = useMemo(() => {
    const items: DataPickerSelectedItem[] = [];

    if (selectedCollectionId) {
      items.push({ type: "schema", id: selectedCollectionId });
    }

    const tables: DataPickerSelectedItem[] = selectedTableIds.map(id => ({
      type: "table",
      id,
    }));

    items.push(...tables);

    return items;
  }, [selectedCollectionId, selectedTableIds]);

  const handleSelectedCollectionChange = useCallback(
    (id: Collection["id"]) => {
      const collection = id === "root" ? rootCollection : collectionsMap[id];
      if (collection) {
        setSelectedCollectionId(id);
        const schemaId = getCollectionVirtualSchemaId(collection, {
          isDatasets: targetModel === "model",
        });
        onChange({ ...value, schemaId, tableIds: [] });
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

  const renderPicker = useCallback(
    ({ schema }: { schema?: Schema } = {}) => {
      const tables = schema?.tables
        ? (schema.tables as VirtualTable[])
        : undefined;
      return (
        <CardPickerView
          collectionTree={collectionTree}
          virtualTables={tables}
          selectedItems={selectedItems}
          targetModel={targetModel}
          onSelectCollection={handleSelectedCollectionChange}
          onSelectedVirtualTable={handleSelectedTablesChange}
          onBack={onBack}
        />
      );
    },
    [
      collectionTree,
      selectedItems,
      targetModel,
      handleSelectedCollectionChange,
      handleSelectedTablesChange,
      onBack,
    ],
  );

  if (!schemaId) {
    return renderPicker();
  }

  return (
    <Schemas.Loader id={schemaId} loadingAndErrorWrapper={false}>
      {({ schema }: { schema?: Schema }) => renderPicker({ schema })}
    </Schemas.Loader>
  );
}

export default _.compose(
  Collections.load({
    id: "root",
    entityAlias: "rootCollection",
    loadingAndErrorWrapper: false,
  }),
  Collections.loadList({
    query: () => ({ tree: true }),
  }),
  connect(mapStateToProps),
)(CardPickerContainer);
