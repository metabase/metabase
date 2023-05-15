import React, { useCallback, useLayoutEffect, useMemo, useState } from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";
import cx from "classnames";
import { msgid, ngettext, t } from "ttag";
import _ from "underscore";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import * as Urls from "metabase/lib/urls";
import Schemas from "metabase/entities/schemas";
import Icon from "metabase/components/Icon/Icon";
import { DatabaseId, SchemaId } from "metabase-types/api";
import { Dispatch, State } from "metabase-types/store";
import Schema from "metabase-lib/metadata/Schema";

interface OwnProps {
  selectedDatabaseId: DatabaseId;
  selectedSchemaId?: SchemaId;
}

interface SchemaLoaderProps {
  schemas: Schema[];
}

interface DispatchProps {
  onSelectSchema: (databaseId: DatabaseId, schemaId: SchemaId) => void;
}

type MetadataSchemaListProps = OwnProps & SchemaLoaderProps & DispatchProps;

const mapDispatchToProps = (dispatch: Dispatch): DispatchProps => ({
  onSelectSchema: (databaseId, schemaId) =>
    dispatch(push(Urls.dataModelSchema(databaseId, schemaId))),
});

const MetadataSchemaList = ({
  schemas: allSchemas,
  selectedDatabaseId,
  selectedSchemaId,
  onSelectSchema,
}: MetadataSchemaListProps) => {
  const [searchText, setSearchText] = useState("");

  const schemas = useMemo(() => {
    const searchValue = searchText.toLowerCase();

    return _.chain(allSchemas)
      .filter(schema => (schema.name ?? "").toLowerCase().includes(searchValue))
      .sortBy(schema => schema.name ?? "")
      .value();
  }, [allSchemas, searchText]);

  const handleSelectSchema = useCallback(
    (schemaId: SchemaId) => {
      onSelectSchema(selectedDatabaseId, schemaId);
    },
    [selectedDatabaseId, onSelectSchema],
  );

  useLayoutEffect(() => {
    if (allSchemas.length === 1 && selectedSchemaId == null) {
      onSelectSchema(selectedDatabaseId, allSchemas[0].id);
    }
  }, [selectedDatabaseId, selectedSchemaId, allSchemas, onSelectSchema]);

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
        <div className="AdminList-section">
          {ngettext(
            msgid`${schemas.length} schema`,
            `${schemas.length} schemas`,
            schemas.length,
          )}
        </div>
        {schemas.map(schema => (
          <SchemaRow
            key={schema.id}
            schema={schema}
            isSelected={schema.id === selectedSchemaId}
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
  onSelectSchema: (schemaId: SchemaId) => void;
}

const SchemaRow = ({ schema, isSelected, onSelectSchema }: SchemaRowProps) => {
  const handleSelect = useCallback(() => {
    onSelectSchema(schema.id);
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  Schemas.loadList({
    query: (_: State, { selectedDatabaseId }: OwnProps) => ({
      dbId: selectedDatabaseId,
      include_hidden: true,
      ...PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataModelQueryProps,
    }),
  }),
  connect(null, mapDispatchToProps),
)(MetadataSchemaList);
