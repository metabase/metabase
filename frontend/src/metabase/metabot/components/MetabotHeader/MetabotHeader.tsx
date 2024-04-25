import { useEffect, useState } from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";
import { jt, t } from "ttag";

import * as Urls from "metabase/lib/urls";
import { getUser } from "metabase/selectors/user";
import type Question from "metabase-lib/v1/Question";
import type Database from "metabase-lib/v1/metadata/Database";
import type { DatabaseId, MetabotFeedbackType, User } from "metabase-types/api";
import type { Dispatch, MetabotQueryStatus, State } from "metabase-types/store";

import { cancelQuery, runPromptQuery, updatePrompt } from "../../actions";
import { getFeedbackType, getQueryStatus, getPrompt } from "../../selectors";
import DatabasePicker from "../DatabasePicker";
import MetabotMessage from "../MetabotMessage";
import MetabotPrompt from "../MetabotPrompt";
import ModelLink from "../ModelLink";

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
  user: User | null;
}

interface DispatchProps {
  onChangePrompt: (prompt: string) => void;
  onSubmitPrompt: () => void;
  onDatabaseChange: (databaseId: DatabaseId) => void;
  onCancel: () => void;
}

type MetabotHeaderProps = OwnProps & StateProps & DispatchProps;

const mapStateToProps = (state: State): StateProps => ({
  prompt: getPrompt(state),
  queryStatus: getQueryStatus(state),
  feedbackType: getFeedbackType(state),
  user: getUser(state),
});

const mapDispatchToProps = (dispatch: Dispatch): DispatchProps => ({
  onChangePrompt: prompt => dispatch(updatePrompt(prompt)),
  onSubmitPrompt: () => dispatch(runPromptQuery()),
  onDatabaseChange: databaseId => push(Urls.databaseMetabot(databaseId)),
  onCancel: () => dispatch(cancelQuery()),
});

const MetabotHeader = ({
  prompt,
  queryStatus,
  model,
  database,
  databases = [],
  user,
  onChangePrompt,
  onSubmitPrompt,
  onDatabaseChange,
  onCancel,
}: MetabotHeaderProps) => {
  const [isLoadedRecently, setIsLoadedRecently] = useState(false);

  useEffect(() => {
    if (queryStatus !== "complete") {
      return;
    }

    setIsLoadedRecently(true);
    const timerId = setTimeout(() => setIsLoadedRecently(false), 5000);
    return () => clearTimeout(timerId);
  }, [queryStatus]);

  const title = getTitle(
    model,
    database,
    databases,
    user,
    queryStatus === "running",
    isLoadedRecently,
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
        onCancel={onCancel}
      />
    </MetabotHeaderRoot>
  );
};

const getTitle = (
  model: Question | undefined,
  database: Database | undefined,
  databases: Database[],
  user: User | null,
  isLoading: boolean,
  isLoadedRecently: boolean,
  onDatabaseChange: (databaseId: number) => void,
) => {
  if (isLoading) {
    return t`A wise, insightful question, indeed.`;
  }
  if (isLoadedRecently) {
    return t`Here you go!`;
  }

  if (model) {
    return getModelTitle(model, user);
  } else if (databases.length > 1 && database) {
    return getDatabaseTitle(database, databases, user, onDatabaseChange);
  } else {
    return t`You can ask me things about your data.`;
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
    return t`Ask something…`;
  }
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(mapStateToProps, mapDispatchToProps)(MetabotHeader);
