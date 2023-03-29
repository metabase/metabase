import React from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";
import { jt, t } from "ttag";
import * as Urls from "metabase/lib/urls";
import { getUser } from "metabase/selectors/user";
import { DatabaseId, MetabotFeedbackType, User } from "metabase-types/api";
import {
  Dispatch,
  MetabotFeedbackStatus,
  MetabotQueryStatus,
  State,
} from "metabase-types/store";
import Question from "metabase-lib/Question";
import Database from "metabase-lib/metadata/Database";
import { runPromptQuery, updatePrompt } from "../../actions";
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
  onChangePrompt: (prompt: string) => void;
  onSubmitPrompt: () => void;
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

const mapDispatchToProps = (dispatch: Dispatch): DispatchProps => ({
  onChangePrompt: prompt => dispatch(updatePrompt(prompt)),
  onSubmitPrompt: () => dispatch(runPromptQuery()),
  onDatabaseChange: databaseId => push(Urls.databaseMetabot(databaseId)),
});

const MetabotHeader = ({
  prompt,
  queryStatus,
  feedbackType,
  model,
  database,
  databases = [],
  user,
  onChangePrompt,
  onSubmitPrompt,
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
        onChangePrompt={onChangePrompt}
        onSubmitPrompt={onSubmitPrompt}
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
