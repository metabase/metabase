import React, { useCallback, useMemo, useState } from "react";
import cx from "classnames";
import { msgid, ngettext, t } from "ttag";
import _ from "underscore";
import Schemas from "metabase/entities/schemas";
import Icon from "metabase/components/Icon/Icon";
import { DatabaseId, Schema, SchemaId } from "metabase-types/api";
import { State } from "metabase-types/store";

interface OwnProps {
  selectedDatabaseId: DatabaseId;
  selectedSchemaId: SchemaId | undefined;
  onSelectSchema: (schema: Schema) => void;
}

interface SchemaLoaderProps {
  schemas: Schema[];
}

type SchemaListProps = OwnProps & SchemaLoaderProps;

const SchemaList = ({
  schemas: allSchemas,
  selectedSchemaId,
  onSelectSchema,
}: SchemaListProps) => {
  const [searchText, setSearchText] = useState("");

  const schemas = useMemo(() => {
    const searchValue = searchText.toLowerCase();

    return _.chain(allSchemas)
      .filter(schema => schema.name.toLowerCase().includes(searchValue))
      .sortBy(schema => schema.name)
      .value();
  }, [allSchemas, searchText]);

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
            isSelected={schema.id === selectedSchemaId}
            onSelectSchema={onSelectSchema}
          />
        ))}
      </ul>
    </div>
  );
};

interface SchemaRowProps {
  schema: Schema;
  isSelected: boolean;
  onSelectSchema: (schema: Schema) => void;
}

const SchemaRow = ({ schema, isSelected, onSelectSchema }: SchemaRowProps) => {
  const handleSelect = useCallback(() => {
    onSelectSchema(schema);
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
        {schema}
      </a>
    </li>
  );
};

export default Schemas.loadList({
  query: (state: State, { selectedDatabaseId }: OwnProps) => ({
    dbId: selectedDatabaseId,
  }),
})(SchemaList);
