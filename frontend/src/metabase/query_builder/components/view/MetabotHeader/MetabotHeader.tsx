import React, { ChangeEvent, useCallback, useState } from "react";
import { connect } from "react-redux";
import { t } from "ttag";
import Input from "metabase/core/components/Input";
import { getUser } from "metabase/selectors/user";
import { cancelQuery, runMetabotQuery } from "metabase/query_builder/actions";
import {
  getIsResultDirty,
  getIsRunning,
} from "metabase/query_builder/selectors";
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
  isResultDirty: boolean;
}

interface DispatchProps {
  onRun: (queryText: string) => void;
  onCancel: () => void;
}

type MetabotHeaderProps = StateProps & DispatchProps;

const mapStateToProps = (state: State): StateProps => ({
  user: getUser(state) ?? undefined,
  isRunning: getIsRunning(state),
  isResultDirty: getIsResultDirty(state),
});

const mapDispatchToProps = {
  onRun: runMetabotQuery,
  onCancel: cancelQuery,
};

const MetabotHeader = ({
  user,
  isRunning,
  isResultDirty,
  onRun,
  onCancel,
}: MetabotHeaderProps) => {
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
    </HeaderRoot>
  );
};

export default connect(mapStateToProps, mapDispatchToProps)(MetabotHeader);
