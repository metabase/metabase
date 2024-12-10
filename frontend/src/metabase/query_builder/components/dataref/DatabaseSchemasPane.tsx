import { useMemo } from "react";
import { msgid, ngettext } from "ttag";

import Search from "metabase/entities/search";
import SidebarContent from "metabase/query_builder/components/SidebarContent";
import type Database from "metabase-lib/v1/metadata/Database";
import type { Card } from "metabase-types/api";
import type { State } from "metabase-types/store";

import {
  NodeListContainer,
  NodeListIcon,
  NodeListItemIcon,
  NodeListItemId,
  NodeListItemLink,
  NodeListItemName,
  NodeListTitle,
  NodeListTitleText,
} from "./NodeList";

interface DatabaseSchemasPaneProps {
  onBack: () => void;
  onClose: () => void;
  onItemClick: (type: string, item: unknown) => void;
  database: Database;
  models: Card[];
}

const DatabaseSchemasPane = ({
  onBack,
  onClose,
  onItemClick,
  database,
  models,
}: DatabaseSchemasPaneProps) => {
  const sortedModels = useMemo(
    () => models.sort((a, b) => a.name.localeCompare(b.name)),
    [models],
  );
  const schemas = database.getSchemas();
  return (
    <SidebarContent
      title={database.name}
      icon={"database"}
      onBack={onBack}
      onClose={onClose}
    >
      <SidebarContent.Pane>
        <NodeListContainer>
          {sortedModels.length ? (
            <>
              <NodeListTitle>
                <NodeListIcon name="model" />
                <NodeListTitleText>
                  {ngettext(
                    msgid`${sortedModels.length} model`,
                    `${sortedModels.length} models`,
                    sortedModels.length,
                  )}
                </NodeListTitleText>
              </NodeListTitle>
              <ul>
                {sortedModels.map(model => (
                  <li key={model.id}>
                    <NodeListItemLink
                      onClick={() => onItemClick("question", model)}
                    >
                      <NodeListItemIcon name="model" />
                      <NodeListItemName>{model.name}</NodeListItemName>
                      <NodeListItemId>{`#${model.id}`}</NodeListItemId>
                    </NodeListItemLink>
                  </li>
                ))}
              </ul>
              <br></br>
            </>
          ) : null}
          <NodeListTitle>
            <NodeListIcon name="folder" />
            <NodeListTitleText>
              {ngettext(
                msgid`${schemas.length} schema`,
                `${schemas.length} schemas`,
                schemas.length,
              )}
            </NodeListTitleText>
          </NodeListTitle>
          <ul>
            {schemas.map(schema => (
              <li key={schema.id}>
                <NodeListItemLink onClick={() => onItemClick("schema", schema)}>
                  <NodeListItemIcon name="folder" />
                  <NodeListItemName>{schema.name}</NodeListItemName>
                </NodeListItemLink>
              </li>
            ))}
          </ul>
        </NodeListContainer>
      </SidebarContent.Pane>
    </SidebarContent>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Search.loadList({
  query: (_state: State, props: DatabaseSchemasPaneProps) => ({
    models: ["dataset"],
    table_db_id: props.database.id,
  }),
  listName: "models",
})(DatabaseSchemasPane);
