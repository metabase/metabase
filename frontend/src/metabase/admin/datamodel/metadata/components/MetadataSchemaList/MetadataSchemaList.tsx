import React, { useCallback, useEffect, useMemo, useState } from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";
import cx from "classnames";
import { msgid, ngettext, t } from "ttag";
import _ from "underscore";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import * as Urls from "metabase/lib/urls";
import Schemas from "metabase/entities/schemas";
import Icon from "metabase/components/Icon/Icon";
import { DatabaseId, Schema } from "metabase-types/api";
import { Dispatch, State } from "metabase-types/store";

interface OwnProps {
  selectedDatabaseId: DatabaseId;
  selectedSchemaName?: string;
}

interface SchemaLoaderProps {
  schemas: Schema[];
}

interface DispatchProps {
  onSelectSchema: (databaseId: DatabaseId, schemaName: string) => void;
}

type MetadataSchemaListProps = OwnProps & SchemaLoaderProps & DispatchProps;

const mapDispatchToProps = (dispatch: Dispatch): DispatchProps => ({
  onSelectSchema: (databaseId, schemaName) =>
    dispatch(push(Urls.dataModelSchema(databaseId, schemaName))),
});

const MetadataSchemaList = ({
  schemas: allSchemas,
  selectedDatabaseId,
  selectedSchemaName,
  onSelectSchema,
}: MetadataSchemaListProps) => {
  const [searchText, setSearchText] = useState("");

  const schemas = useMemo(() => {
    const searchValue = searchText.toLowerCase();

    return _.chain(allSchemas)
      .filter(schema => schema.name.toLowerCase().includes(searchValue))
      .sortBy(schema => schema.name)
      .value();
  }, [allSchemas, searchText]);

  const handleSelectSchema = useCallback(
    (schemaName: string) => {
      onSelectSchema(selectedDatabaseId, schemaName);
    },
    [selectedDatabaseId, onSelectSchema],
  );

  useEffect(() => {
    if (schemas.length === 1 && selectedSchemaName == null) {
      onSelectSchema(selectedDatabaseId, schemas[0].name);
    }
  }, [selectedDatabaseId, selectedSchemaName, schemas, onSelectSchema]);

  return (
    <div className="MetadataEditor-table-list AdminList flex-no-shrink">
      <div className="AdminList-search">
        <Icon name="search" size={16} />
        <input
          className="AdminInput pl4 border-bottom"
          type="text"
          placeholder={t`Find a schema`}
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
        />
      </div>
      <ul className="AdminList-items">
        <li className="AdminList-section">
          {ngettext(
            msgid`${schemas.length} schema`,
            `${schemas.length} schemas`,
            schemas.length,
          )}
        </li>
        {schemas.map(schema => (
          <SchemaRow
            key={schema.id}
            schema={schema}
            isSelected={schema.name === selectedSchemaName}
            onSelectSchema={handleSelectSchema}
          />
        ))}
      </ul>
    </div>
  );
};

interface SchemaRowProps {
  schema: Schema;
  isSelected: boolean;
  onSelectSchema: (schemaName: string) => void;
}

const SchemaRow = ({ schema, isSelected, onSelectSchema }: SchemaRowProps) => {
  const handleSelect = useCallback(() => {
    onSelectSchema(schema.name);
  }, [schema, onSelectSchema]);

  return (
    <li key={schema.id}>
      <a
        className={cx(
          "AdminList-item flex align-center no-decoration text-wrap",
          { selected: isSelected },
        )}
        onClick={handleSelect}
      >
        {schema.name}
      </a>
    </li>
  );
};

export default _.compose(
  Schemas.loadList({
    query: (_: State, { selectedDatabaseId }: OwnProps) => ({
      dbId: selectedDatabaseId,
      ...PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataModelQueryProps,
    }),
  }),
  connect(null, mapDispatchToProps),
)(MetadataSchemaList);
