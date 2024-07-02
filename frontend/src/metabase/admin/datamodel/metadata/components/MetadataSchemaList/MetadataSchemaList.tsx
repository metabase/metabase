import cx from "classnames";
import { useCallback, useLayoutEffect, useMemo, useState } from "react";
import { connect } from "react-redux";
import { push, replace } from "react-router-redux";
import { msgid, ngettext, t } from "ttag";
import _ from "underscore";

import AdminS from "metabase/css/admin.module.css";
import CS from "metabase/css/core/index.css";
import Schemas from "metabase/entities/schemas";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import { Icon } from "metabase/ui";
import type Schema from "metabase-lib/v1/metadata/Schema";
import type { DatabaseId, SchemaId } from "metabase-types/api";
import type { Dispatch, State } from "metabase-types/store";

interface OwnProps {
  selectedDatabaseId: DatabaseId;
  selectedSchemaId?: SchemaId;
}

interface SchemaLoaderProps {
  schemas: Schema[];
}

interface DispatchProps {
  onSelectSchema: (
    databaseId: DatabaseId,
    schemaId: SchemaId,
    options?: { useReplace?: boolean },
  ) => void;
}

type MetadataSchemaListProps = OwnProps & SchemaLoaderProps & DispatchProps;

const mapDispatchToProps = (dispatch: Dispatch): DispatchProps => ({
  // When navigating programatically, use replace so that the browser back button works
  onSelectSchema: (databaseId, schemaId, { useReplace = false } = {}) => {
    dispatch(
      useReplace
        ? replace(Urls.dataModelSchema(databaseId, schemaId))
        : push(Urls.dataModelSchema(databaseId, schemaId)),
    );
  },
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
      onSelectSchema(selectedDatabaseId, allSchemas[0].id, {
        useReplace: true,
      });
    }
  }, [selectedDatabaseId, selectedSchemaId, allSchemas, onSelectSchema]);

  return (
    <aside className={cx(AdminS.AdminList, CS.flexNoShrink)}>
      <div className={AdminS.AdminListSearch}>
        <Icon className={AdminS.Icon} name="search" size={16} />
        <input
          className={cx(AdminS.AdminInput, CS.pl4, CS.borderBottom)}
          type="text"
          placeholder={t`Find a schema`}
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
        />
      </div>
      <ul>
        <div className={AdminS.AdminListSection}>
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
    </aside>
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
          CS.textWrap,
          AdminS.AdminListItem,
          { [AdminS.selected]: isSelected },
          CS.flex,
          CS.alignCenter,
          CS.noDecoration,
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
