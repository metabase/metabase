import React, { useCallback, useMemo, useState } from "react";
import cx from "classnames";
import { msgid, ngettext, t } from "ttag";
import _ from "underscore";
import Icon from "metabase/components/Icon/Icon";
import { DatabaseId, Schema } from "metabase-types/api";

interface SchemaListProps {
  schemas: Schema[];
  selectedDatabaseId: DatabaseId;
  selectedSchema?: Schema;
  onSelectSchema: (schemaName: string) => void;
}

const SchemaList = ({
  schemas: allSchemas,
  selectedSchema,
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
            isSelected={schema.id === selectedSchema?.id}
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
        {schema}
      </a>
    </li>
  );
};

export default SchemaList;
