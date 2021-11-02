import React from "react";
import PropTypes from "prop-types";
import {
  DatabaseCard,
  DatabaseContent,
  DatabaseIcon,
  DatabaseTitle,
  SyncStatusRoot,
} from "./SyncStatus.styled";
import Icon from "metabase/components/Icon";

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
          </DatabaseContent>
        </DatabaseCard>
      ))}
    </SyncStatusRoot>
  );
};

SyncStatus.propTypes = propTypes;

export default SyncStatus;
