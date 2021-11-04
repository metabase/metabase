import React, { useCallback, useState } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import Icon from "metabase/components/Icon";
import Ellipsified from "metabase/components/Ellipsified";
import {
  DatabaseCard,
  DatabaseContent,
  DatabaseDescription,
  DatabaseIcon,
  DatabaseIconContainer,
  DatabaseSpinner,
  DatabaseTitle,
  SnackbarRoot,
  SnackbarContent,
  SnackbarHeader,
  SnackbarTitle,
  SnackbarToggle,
} from "./SyncSnackbar.styled";

const propTypes = {
  databases: PropTypes.array.isRequired,
};

export const SyncSnackbar = ({ databases }) => {
  const [isOpened, setIsOpened] = useState(true);
  const handleToggle = useCallback(() => setIsOpened(state => !state), []);

  return (
    <SnackbarRoot>
      <SnackbarHeader>
        <SnackbarTitle>{getTitleMessage(databases, isOpened)}</SnackbarTitle>
        <SnackbarToggle onClick={handleToggle}>
          {isOpened ? <Icon name="chevrondown" /> : <Icon name="chevronup" />}
        </SnackbarToggle>
      </SnackbarHeader>
      {isOpened && (
        <SnackbarContent>
          {databases.map(database => (
            <DatabaseCard key={database.id}>
              <DatabaseIcon>
                <Icon name="database" />
              </DatabaseIcon>
              <DatabaseContent>
                <DatabaseTitle>
                  <Ellipsified>{database.name}</Ellipsified>
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
        </SnackbarContent>
      )}
    </SnackbarRoot>
  );
};

SyncSnackbar.propTypes = propTypes;

const getTitleMessage = (databases, isOpened) => {
  const tables = databases.filter(d => !d.initial_sync).flatMap(d => d.tables);
  const totalCount = tables.length;

  const done = databases.every(d => d.initial_sync);
  const doneCount = tables.filter(t => t.initial_sync).length;
  const donePercentage = Math.floor((doneCount / totalCount) * 100);

  return done
    ? t`Done!`
    : !isOpened && totalCount
    ? t`Syncing… (${donePercentage}%)`
    : t`Syncing…`;
};

const getDescriptionMessage = database => {
  const doneCount = database.tables.filter(t => t.initial_sync).length;
  const totalCount = database.tables.length;

  return t`${doneCount} of ${totalCount} done`;
};

export default SyncSnackbar;
