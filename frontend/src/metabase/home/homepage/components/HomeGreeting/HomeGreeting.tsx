import React, { useMemo } from "react";
import { connect } from "react-redux";
import { t } from "ttag";
import _ from "underscore";
import Tooltip from "metabase/core/components/Tooltip";
import { getUser } from "metabase/selectors/user";
import { getSetting } from "metabase/selectors/settings";
import { User } from "metabase-types/api";
import { State } from "metabase-types/store";
import {
  GreetingLogo,
  GreetingMessage,
  GreetingRoot,
} from "./HomeGreeting.styled";

interface StateProps {
  user: User | null;
  showLogo?: boolean;
}

type HomeGreetingProps = StateProps;

const mapStateToProps = (state: State): StateProps => ({
  user: getUser(state),
  showLogo: getSetting(state, "show-metabot"),
});

const HomeGreeting = ({ user, showLogo }: HomeGreetingProps): JSX.Element => {
  const name = user?.first_name;
  const message = useMemo(() => getMessage(name), [name]);

  return (
    <GreetingRoot>
      {showLogo && (
        <Tooltip
          tooltip={t`Don't tell anyone, but you're my favorite.`}
          placement="bottom"
        >
          <GreetingLogo />
        </Tooltip>
      )}
      <GreetingMessage showLogo={showLogo}>{message}</GreetingMessage>
    </GreetingRoot>
  );
};

const getMessage = (name: string | null | undefined): string => {
  const namePart = name ? `, ${name}` : "";
  const options = [
    t`Hey there${namePart}`,
    t`How's it going${namePart}?`,
    t`Howdy${namePart}`,
    t`Greetings${namePart}`,
    t`Good to see you${namePart}`,
  ];

  return _.sample(options) ?? "";
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(mapStateToProps)(HomeGreeting);
