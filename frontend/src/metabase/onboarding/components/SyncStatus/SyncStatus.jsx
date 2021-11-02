import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import Icon from "metabase/components/Icon";
import {
  DatabaseCard,
  DatabaseContent,
  DatabaseDescription,
  DatabaseIcon,
  DatabaseTitle,
  SyncStatusRoot,
} from "./SyncStatus.styled";

const propTypes = {
  databases: PropTypes.array,
};

const SyncStatus = ({ databases }) => {
  return (
    <SyncStatusRoot>
      {databases.map(database => (
        <DatabaseCard key={database.id}>
          <DatabaseIcon>
            <Icon name="database" />
          </DatabaseIcon>
          <DatabaseContent>
            <DatabaseTitle>
              {database.display_name || database.name}
            </DatabaseTitle>
            <DatabaseDescription>
              {getDatabaseDescription(database)}
            </DatabaseDescription>
          </DatabaseContent>
        </DatabaseCard>
      ))}
    </SyncStatusRoot>
  );
};

SyncStatus.propTypes = propTypes;

const getDatabaseDescription = ({ tables }) => {
  const doneCount = tables.filter(t => t.initial_sync).length;
  const totalCount = tables.length;

  return t`${doneCount} of ${totalCount} done`;
};

export default SyncStatus;
