import React from "react";
import { connect } from "react-redux";
import { t } from "ttag";
import { getUser } from "metabase/selectors/user";
import RunButton from "metabase/query_builder/components/RunButton";
import { cancelQuery, runQuestionQuery } from "metabase/query_builder/actions";
import {
  getIsDirty,
  getIsRunning,
  getQuestion,
} from "metabase/query_builder/selectors";
import { User } from "metabase-types/api";
import { State } from "metabase-types/store";
import Question from "metabase-lib/Question";
import {
  HeaderRoot,
  GreetingSection,
  GreetingMetabotLogo,
  GreetingMessage,
  PromptSection,
  PromptUserAvatarContainer,
  PromptUserAvatar,
} from "./MetabotHeader.styled";

interface StateProps {
  user: User | undefined;
  question: Question | undefined;
  isRunning: boolean;
  isDirty: boolean;
}

interface DispatchProps {
  onRun: (opts?: RunQueryOpts) => void;
  onCancel: () => void;
}

interface RunQueryOpts {
  ignoreCache?: boolean;
}

type MetabotHeaderProps = StateProps & DispatchProps;

const mapStateToProps = (state: State): StateProps => ({
  question: getQuestion(state),
  user: getUser(state) ?? undefined,
  isRunning: getIsRunning(state),
  isDirty: getIsDirty(state),
});

const mapDispatchToProps = {
  onRun: runQuestionQuery,
  onCancel: cancelQuery,
};

const MetabotHeader = ({
  question,
  user,
  isRunning,
  isDirty,
  onRun,
  onCancel,
}: MetabotHeaderProps) => {
  const handleRun = () => onRun({ ignoreCache: true });
  const handleCancel = () => onCancel();

  return (
    <HeaderRoot>
      <GreetingSection>
        <GreetingMetabotLogo />
        <GreetingMessage>{getGreetingMessage(question, user)}</GreetingMessage>
      </GreetingSection>
      <PromptSection>
        {user && (
          <PromptUserAvatarContainer>
            <PromptUserAvatar user={user} />
          </PromptUserAvatarContainer>
        )}
        <RunButton
          isRunning={isRunning}
          isDirty={isDirty}
          compact
          onRun={handleRun}
          onCancel={handleCancel}
        />
      </PromptSection>
    </HeaderRoot>
  );
};

const getGreetingMessage = (question?: Question, user?: User) => {
  const questionName = question?.displayName();
  const userName = user?.first_name;

  if (questionName && userName) {
    return t`What do you want to know about ${questionName}, ${userName}? `;
  } else if (questionName) {
    return t`What do you want to know about ${questionName}? `;
  } else {
    return t`What can I answer for you?`;
  }
};

export default connect(mapStateToProps, mapDispatchToProps)(MetabotHeader);
