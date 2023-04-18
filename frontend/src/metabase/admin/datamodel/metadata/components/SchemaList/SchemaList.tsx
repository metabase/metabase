import React, { useMemo, useState } from "react";
import cx from "classnames";
import { msgid, ngettext, t } from "ttag";
import Schemas from "metabase/entities/schemas";
import Icon from "metabase/components/Icon/Icon";
import { DatabaseId, Schema, SchemaId } from "metabase-types/api";
import { State } from "metabase-types/store";

interface OwnProps {
  selectedDatabaseId: DatabaseId;
  selectedSchemaId?: SchemaId;
  onChangeSchema: (schema: Schema) => void;
}

interface SchemaLoaderProps {
  schemas: Schema[];
}

type SchemaListProps = OwnProps & SchemaLoaderProps;

const SchemaList = ({
  schemas,
  selectedSchemaId,
  onChangeSchema,
}: SchemaListProps) => {
  const [searchText, setSearchText] = useState("");

  const filteredSchemas = useMemo(() => {
    return schemas.filter(({ name }) =>
      name.toLowerCase().includes(searchText.toLowerCase()),
    );
  }, [schemas, searchText]);

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
          {(n => ngettext(msgid`${n} schema`, `${n} schemas`, n))(
            schemas.length,
          )}
        </li>
        {filteredSchemas.map(schema => (
          <li key={schema.id}>
            <a
              className={cx(
                "AdminList-item flex align-center no-decoration text-wrap",
                {
                  selected: schema.id === selectedSchemaId,
                },
              )}
              onClick={() => onChangeSchema(schema)}
            >
              {schema}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default Schemas.loadList({
  query: (state: State, { selectedDatabaseId }: OwnProps) => ({
    dbId: selectedDatabaseId,
  }),
})(SchemaList);
