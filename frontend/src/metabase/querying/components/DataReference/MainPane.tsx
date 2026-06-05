import cx from "classnames";
import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { SidebarContent } from "metabase/common/components/SidebarContent";
import CS from "metabase/css/core/index.css";

import {
  NodeListItemIcon,
  NodeListItemLink,
  NodeListItemName,
} from "./NodeList";
import type { DataReferencePaneProps } from "./types";

export const MainPane = ({
  onClose,
  onItemClick,
  onBack,
}: DataReferencePaneProps) => {
  const { data, isLoading, error } = useListDatabasesQuery();

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <SidebarContent title={t`Data Reference`} onClose={onClose} onBack={onBack}>
      <SidebarContent.Pane>
        <p className={cx(CS.mt2, CS.mb3, CS.textSpaced)}>
          {t`Browse the contents of your databases, tables, and columns. Pick a database to get started.`}
        </p>
        <ul>
          {data?.data?.map((database) => (
            <li key={database.id}>
              <NodeListItemLink
                onClick={() =>
                  onItemClick({ type: "database", id: database.id })
                }
              >
                <NodeListItemIcon name="database" />
                <NodeListItemName>{database.name}</NodeListItemName>
              </NodeListItemLink>
            </li>
          ))}
        </ul>
      </SidebarContent.Pane>
    </SidebarContent>
  );
};
