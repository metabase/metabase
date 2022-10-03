import React, { useMemo } from "react";
import Icon from "metabase/components/Icon";
import Schemas from "metabase/entities/schemas";
import { State } from "metabase-types/store";
import Schema from "metabase-lib/lib/metadata/Schema";

interface Props {
  show: (type: string, item: unknown) => void;
  schema: Schema;
}

const SchemaPaneInner = ({ schema, show }: Props) => {
  const tables = useMemo(
    () => schema.tables.sort((a, b) => a.name.localeCompare(b.name)),
    [schema.tables],
  );
  return (
    <div>
      <div className="ml1 my2 flex align-center justify-between border-bottom pb1">
        <div className="flex align-center">
          <Icon name="table2" className="text-light pr1" size={12} />
          <span className="text-medium">{tables.length}</span>
        </div>
      </div>
      <ul>
        {tables.map(table => (
          <li key={table.id}>
            <a
              className="flex-full flex p1 text-bold text-brand text-wrap no-decoration bg-medium-hover"
              onClick={() => show("table", table)}
            >
              {table.name}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
};

const SchemaPane = Schemas.load({
  id: (_state: State, { schema }: Props) => schema.id,
})(SchemaPaneInner);

export default SchemaPane;
