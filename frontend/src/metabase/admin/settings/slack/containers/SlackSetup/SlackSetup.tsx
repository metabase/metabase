import type { ComponentType } from "react";
import { connect } from "react-redux";

import type { State } from "metabase-types/store";

import SlackSetup from "../../components/SlackSetup";
import SlackSetupForm from "../../containers/SlackSetupForm";
import { hasSlackBotToken, isSlackTokenValid } from "../../selectors";

interface SlackSetupProps {
  manifest?: string;
}

interface SlackSetupStateProps {
  Form: ComponentType;
  isBot?: boolean;
  isValid?: boolean;
}

const mapStateToProps = (state: State): SlackSetupStateProps => ({
  Form: SlackSetupForm,
  isBot: hasSlackBotToken(state),
  isValid: isSlackTokenValid(state),
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect<SlackSetupStateProps, unknown, SlackSetupProps, State>(
  mapStateToProps,
)(SlackSetup);
