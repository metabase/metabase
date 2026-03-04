/* eslint "react/prop-types": "warn" */
import cx from "classnames";
import PropTypes from "prop-types";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { Databases } from "metabase/entities/databases";
import { SidebarContent } from "metabase/query_builder/components/SidebarContent";

import {
  NodeListItemIcon,
  NodeListItemLink,
  NodeListItemName,
} from "./NodeList";

const MainPaneInner = ({ databases, onClose, onItemClick, onBack }) => (
  <SidebarContent title={t`Data Reference`} onClose={onClose} onBack={onBack}>
    <SidebarContent.Pane>
      <p className={cx(CS.mt2, CS.mb3, CS.textSpaced)}>
        {t`Browse the contents of your databases, tables, and columns. Pick a database to get started.`}
      </p>
      <ul>
        {databases &&
          databases.map((database) => (
            <li key={database.id}>
              <NodeListItemLink
                onClick={() => onItemClick("database", database)}
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

MainPaneInner.propTypes = {
  databases: PropTypes.array,
  onClose: PropTypes.func,
  onBack: PropTypes.func,
  onItemClick: PropTypes.func.isRequired,
};

export const MainPane = Databases.loadList()(MainPaneInner);
