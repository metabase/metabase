import cx from "classnames";
import { useCallback, useLayoutEffect, useMemo, useState } from "react";
import { push, replace } from "react-router-redux";
import { msgid, ngettext, t } from "ttag";

import { useListDatabaseSchemasQuery } from "metabase/api";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import AdminS from "metabase/css/admin.module.css";
import CS from "metabase/css/core/index.css";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import { Icon } from "metabase/ui";
import {
  generateSchemaId,
  parseSchemaId,
} from "metabase-lib/v1/metadata/utils/schema";
import type { DatabaseId, SchemaId } from "metabase-types/api";

type MetadataSchemaListProps = {
  selectedDatabaseId: DatabaseId;
  selectedSchemaId?: SchemaId;
};

export const MetadataSchemaList = ({
  selectedDatabaseId,
  selectedSchemaId,
}: MetadataSchemaListProps) => {
  const {
    data: allSchemas = [],
    error,
    isLoading,
  } = useListDatabaseSchemasQuery({
    id: selectedDatabaseId,
    include_hidden: true,
    ...PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataModelQueryProps,
  });
  const [searchText, setSearchText] = useState("");
  const [_, selectedSchema] = parseSchemaId(selectedSchemaId);
  const dispatch = useDispatch();

  const schemas = useMemo(() => {
    const searchValue = searchText.toLowerCase();

    return allSchemas
      .filter(schema => schema.toLowerCase().includes(searchValue))
      .sort();
  }, [allSchemas, searchText]);

  const handleSelectSchema = (newSchema: string) => {
    const newSchemaId = generateSchemaId(selectedDatabaseId, newSchema);
    dispatch(push(Urls.dataModelSchema(selectedDatabaseId, newSchemaId)));
  };

  useLayoutEffect(() => {
    if (allSchemas.length === 1 && selectedSchemaId == null) {
      const newSchemaId = generateSchemaId(selectedDatabaseId, allSchemas[0]);
      dispatch(replace(Urls.dataModelSchema(selectedDatabaseId, newSchemaId)));
    }
  }, [selectedDatabaseId, selectedSchemaId, allSchemas, dispatch]);

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

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
            key={schema}
            schema={schema}
            isSelected={schema === selectedSchema}
            onSelectSchema={handleSelectSchema}
          />
        ))}
      </ul>
    </aside>
  );
};

interface SchemaRowProps {
  schema: string;
  isSelected: boolean;
  onSelectSchema: (schema: string) => void;
}

const SchemaRow = ({ schema, isSelected, onSelectSchema }: SchemaRowProps) => {
  const handleSelect = useCallback(() => {
    onSelectSchema(schema);
  }, [schema, onSelectSchema]);

  return (
    <li key={schema}>
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
        {schema}
      </a>
    </li>
  );
};
