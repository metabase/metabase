import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import Icon from "metabase/components/Icon";
import {
  DatabaseCard,
  DatabaseContent,
  DatabaseDescription,
  DatabaseIcon,
  DatabaseIconContainer,
  DatabaseSpinner,
  DatabaseTitle,
  Popup,
  PopupContent,
  PopupHeader,
  PopupTitle,
} from "./SyncStatus.styled";

const propTypes = {
  databases: PropTypes.array,
};

const SyncStatus = ({ databases }) => {
  return (
    <Popup>
      <PopupHeader>
        <PopupTitle>{getTitleMessage(databases)}</PopupTitle>
      </PopupHeader>
      <PopupContent>
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
                {getDescriptionMessage(database)}
              </DatabaseDescription>
            </DatabaseContent>
            {database.initial_sync ? (
              <DatabaseIconContainer>
                <Icon name="check" size={12} />
              </DatabaseIconContainer>
            ) : (
              <DatabaseSpinner size={24} borderWidth={3} />
            )}
          </DatabaseCard>
        ))}
      </PopupContent>
    </Popup>
  );
};

SyncStatus.propTypes = propTypes;

const getTitleMessage = databases => {
  return databases.every(d => d.initial_sync) ? t`Done!` : t`Syncing...`;
};

const getDescriptionMessage = database => {
  const doneCount = database.tables.filter(t => t.initial_sync).length;
  const totalCount = database.tables.length;

  return t`${doneCount} of ${totalCount} done`;
};

export default SyncStatus;
