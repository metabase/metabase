import React, { ChangeEvent, useCallback, useState } from "react";
import { connect } from "react-redux";
import { t, jt } from "ttag";
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
  getOriginalQuestion,
} from "metabase/query_builder/selectors";
import { Card, Database, User } from "metabase-types/api";
import { State } from "metabase-types/store";
import Button from "metabase/core/components/Button";
import Question from "metabase-lib/Question";
import { DatabaseDataSelector } from "../../DataSelector";
import {
  EntityLink,
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
  mode: "database" | "model";
}

interface StateProps {
  user: User | undefined;
  isRunning: boolean;
  isResultDirty: boolean;
  card: Card;
  model?: Question;
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
  model: getOriginalQuestion(state),
  card: getCard(state),
});

const mapDispatchToProps = {
  onRun: runMetabotQuery,
  onCancel: cancelQuery,
  onDatabaseChange: setQueryDatabase,
};

const getDatabaseModeMetabotReply = (
  databases: Database[],
  onDatabaseChange: (databaseId: number) => void,
  queryDatabaseId?: number,
  user?: User,
) => {
  const selectedDatabase = databases.find(db => db.id === queryDatabaseId);
  if (queryDatabaseId == null || selectedDatabase == null) {
    return t`First, let me know what database you want to ask me about.`;
  }

  return (
    <div>{jt`What do you want to know about ${(
      <DatabaseDataSelector
        triggerClasses="inline"
        triggerElement={<Button onlyText>{selectedDatabase.name}</Button>}
        databases={databases}
        selectedDatabaseId={queryDatabaseId}
        setDatabaseFn={onDatabaseChange}
      />
    )}, ${user?.first_name}?`}</div>
  );
};

const MetabotHeader = ({
  user,
  card,
  model,
  databases,
  isRunning,
  isResultDirty,
  onRun,
  onCancel,
  onDatabaseChange,
}: MetabotHeaderProps) => {
  const isDatabaseMode = model == null;
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
        <GreetingMessage>
          {isDatabaseMode
            ? getDatabaseModeMetabotReply(
                databases,
                onDatabaseChange,
                queryDatabaseId,
                user,
              )
            : jt`What do you want to know about ${(
                <EntityLink to={model.getUrl()}>
                  {model.displayName()}
                </EntityLink>
              )}, ${user?.first_name}?`}
        </GreetingMessage>
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
