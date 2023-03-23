import React, { ChangeEvent, useCallback, useState } from "react";
import { connect } from "react-redux";
import { t } from "ttag";
import _ from "underscore";
import Input from "metabase/core/components/Input";
import { getUser } from "metabase/selectors/user";

import {
  cancelQuery,
  runMetabotQuery,
  setQueryDatabase,
} from "metabase/query_builder/actions";
import Databases from "metabase/entities/databases";

import {
  getCard,
  getIsResultDirty,
  getIsRunning,
} from "metabase/query_builder/selectors";
import { Card, Database, User } from "metabase-types/api";
import { State } from "metabase-types/store";
import { DatabaseDataSelector } from "../../DataSelector";
import {
  GreetingMessage,
  GreetingMetabotLogo,
  GreetingSection,
  HeaderRoot,
  PromptRunButton,
  PromptSection,
  PromptUserAvatar,
} from "./MetabotHeader.styled";

interface OwnProps {
  databases: Database[];
}

interface StateProps {
  user: User | undefined;
  isRunning: boolean;
  isResultDirty: boolean;
  card: Card;
}

interface DispatchProps {
  onRun: (queryText: string) => void;
  onCancel: () => void;
  onDatabaseChange: (databaseId: number) => void;
}

type MetabotHeaderProps = StateProps & DispatchProps & OwnProps;

const mapStateToProps = (state: State): StateProps => ({
  user: getUser(state) ?? undefined,
  isRunning: getIsRunning(state),
  isResultDirty: getIsResultDirty(state),
  card: getCard(state),
});

const mapDispatchToProps = {
  onRun: runMetabotQuery,
  onCancel: cancelQuery,
  onDatabaseChange: setQueryDatabase,
};

const MetabotHeader = ({
  user,
  isRunning,
  isResultDirty,
  card,
  databases,
  onRun,
  onCancel,
  onDatabaseChange,
}: MetabotHeaderProps) => {
  const queryDatabaseId = card?.dataset_query.database;
  const hasDatabase = card != null && queryDatabaseId != null;

  const [query, setQuery] = useState("");

  const handleQueryChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setQuery(event.target.value);
    },
    [],
  );

  const handleRun = useCallback(() => {
    onRun(query);
  }, [query, onRun]);

  const handleCancel = useCallback(() => {
    onCancel();
  }, [onCancel]);

  return (
    <HeaderRoot>
      <GreetingSection>
        <GreetingMetabotLogo />
        <GreetingMessage>{t`What can I answer for you?`}</GreetingMessage>
      </GreetingSection>
      {hasDatabase ? (
        <PromptSection>
          {user && <PromptUserAvatar user={user} />}
          <Input
            value={query}
            placeholder={t`Ask something`}
            fullWidth
            onChange={handleQueryChange}
          />
          <PromptRunButton
            isRunning={isRunning}
            isDirty={isResultDirty}
            compact
            onRun={handleRun}
            onCancel={handleCancel}
          />
        </PromptSection>
      ) : (
        <DatabaseDataSelector
          databases={databases}
          selectedDatabaseId={queryDatabaseId}
          setDatabaseFn={onDatabaseChange}
        />
      )}
    </HeaderRoot>
  );
};

export default _.compose(
  Databases.loadList(),
  connect(mapStateToProps, mapDispatchToProps),
)(MetabotHeader);
