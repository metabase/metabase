import React from "react";
import { connect } from "react-redux";
import { jt, t } from "ttag";
import { getUser } from "metabase/selectors/user";
import { DatabaseId, MetabotFeedbackType, User } from "metabase-types/api";
import {
  MetabotFeedbackStatus,
  MetabotQueryStatus,
  State,
} from "metabase-types/store";
import Question from "metabase-lib/Question";
import Database from "metabase-lib/metadata/Database";
import { runTextQuery, setPromptText } from "../../actions";
import {
  getFeedbackStatus,
  getFeedbackType,
  getQueryStatus,
  getPrompt,
} from "../../selectors";
import MetabotMessage from "../MetabotMessage";
import MetabotPrompt from "../MetabotPrompt";
import ModelLink from "../ModelLink";
import DatabasePicker from "../DatabasePicker";
import { MetabotHeaderRoot } from "./MetabotHeader.styled";

interface OwnProps {
  model?: Question;
  database?: Database;
  databases?: Database[];
}

interface StateProps {
  prompt: string;
  queryStatus: MetabotQueryStatus;
  feedbackType: MetabotFeedbackType | null;
  feedbackStatus: MetabotFeedbackStatus;
  user: User | null;
}

interface DispatchProps {
  onChangeQuery: (prompt: string) => void;
  onSubmitQuery: () => void;
  onDatabaseChange: (databaseId: DatabaseId) => void;
}

type MetabotHeaderProps = OwnProps & StateProps & DispatchProps;

const mapStateToProps = (state: State): StateProps => ({
  prompt: getPrompt(state),
  queryStatus: getQueryStatus(state),
  feedbackType: getFeedbackType(state),
  feedbackStatus: getFeedbackStatus(state),
  user: getUser(state),
});

const mapDispatchToProps: DispatchProps = {
  onChangeQuery: setPromptText,
  onSubmitQuery: runTextQuery,
  onDatabaseChange: () => undefined,
};

const MetabotHeader = ({
  prompt,
  queryStatus,
  feedbackType,
  model,
  database,
  databases = [],
  user,
  onChangeQuery,
  onSubmitQuery,
  onDatabaseChange,
}: MetabotHeaderProps) => {
  const title = getTitle(
    model,
    database,
    databases,
    user,
    feedbackType,
    onDatabaseChange,
  );
  const placeholder = getPlaceholder(model);

  return (
    <MetabotHeaderRoot>
      <MetabotMessage>{title}</MetabotMessage>
      <MetabotPrompt
        prompt={prompt}
        placeholder={placeholder}
        user={user}
        isLoading={queryStatus === "running"}
        onChangeQuery={onChangeQuery}
        onSubmitQuery={onSubmitQuery}
      />
    </MetabotHeaderRoot>
  );
};

const getTitle = (
  model: Question | undefined,
  database: Database | undefined,
  databases: Database[],
  user: User | null,
  feedbackType: MetabotFeedbackType | null,
  onDatabaseChange: (databaseId: number) => void,
) => {
  if (feedbackType === "invalid-sql") {
    return t`Sorry about that. Let me know what the SQL should've been.`;
  } else if (model) {
    return getModelTitle(model, user);
  } else if (database) {
    return getDatabaseTitle(database, databases, user, onDatabaseChange);
  }
};

const getModelTitle = (model: Question, user: User | null) => {
  const link = <ModelLink model={model} />;
  const name = user?.first_name;

  return name
    ? jt`What do you want to know about ${link}, ${name}?`
    : jt`What do you want to know about ${link}?`;
};

const getDatabaseTitle = (
  database: Database,
  databases: Database[] = [],
  user: User | null,
  onDatabaseChange: (databaseId: number) => void,
) => {
  const name = user?.first_name;
  const databasePicker = (
    <DatabasePicker
      databases={databases}
      selectedDatabaseId={database.id}
      onChange={onDatabaseChange}
    />
  );

  return name
    ? jt`What do you want to know about ${databasePicker}, ${name}?`
    : jt`What do you want to know about ${databasePicker}?`;
};

const getPlaceholder = (model?: Question) => {
  if (model) {
    return t`Ask something like, how many ${model.displayName()} have we had over time?`;
  } else {
    return t`Ask something...`;
  }
};

export default connect(mapStateToProps, mapDispatchToProps)(MetabotHeader);
