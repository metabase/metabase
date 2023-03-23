import React from "react";
import { connect } from "react-redux";
import { t } from "ttag";
import { getUser } from "metabase/selectors/user";
import { User } from "metabase-types/api";
import { State } from "metabase-types/store";
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
  user: User | null;
}

type MetabotHeaderProps = StateProps;

const mapStateToProps = (state: State): StateProps => ({
  user: getUser(state),
});

const MetabotHeader = ({ user }: MetabotHeaderProps) => {
  return (
    <HeaderRoot>
      <GreetingSection>
        <GreetingMetabotLogo />
        <GreetingMessage>{t`What can I answer for you?`}</GreetingMessage>
      </GreetingSection>
      <PromptSection>
        {user && (
          <PromptUserAvatarContainer>
            <PromptUserAvatar user={user} />
          </PromptUserAvatarContainer>
        )}
      </PromptSection>
    </HeaderRoot>
  );
};

export default connect(mapStateToProps)(MetabotHeader);
