import React from "react";
import { connect } from "react-redux";
import { t } from "ttag";
import Input from "metabase/core/components/Input";
import { getUser } from "metabase/selectors/user";
import { cancelQuery, runQuestionQuery } from "metabase/query_builder/actions";
import { getIsDirty, getIsRunning } from "metabase/query_builder/selectors";
import { User } from "metabase-types/api";
import { State } from "metabase-types/store";
import {
  GreetingMessage,
  GreetingMetabotLogo,
  GreetingSection,
  HeaderRoot,
  PromptRunButton,
  PromptSection,
  PromptUserAvatar,
} from "./MetabotHeader.styled";

interface StateProps {
  user: User | undefined;
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
  user: getUser(state) ?? undefined,
  isRunning: getIsRunning(state),
  isDirty: getIsDirty(state),
});

const mapDispatchToProps = {
  onRun: runQuestionQuery,
  onCancel: cancelQuery,
};

const MetabotHeader = ({
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
        <GreetingMessage>{t`What can I answer for you?`}</GreetingMessage>
      </GreetingSection>
      <PromptSection>
        {user && <PromptUserAvatar user={user} />}
        <Input placeholder={t`Ask something`} fullWidth />
        <PromptRunButton
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

export default connect(mapStateToProps, mapDispatchToProps)(MetabotHeader);
