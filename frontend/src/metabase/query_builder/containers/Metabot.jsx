import React, { useState } from "react";
import { connect } from "react-redux";

import _ from "underscore";

import { getMetadata } from "metabase/selectors/metadata";
import { getUser } from "metabase/selectors/user";

import AIPromptHeader from "../components/AIPromptHeader";
import { MetabotResultsPlaceholder, MetabotRoot } from "./Metabot.styled";

const mapStateToProps = (state, props) => {
  return {
    user: getUser(state, props),
    metadata: getMetadata(state, props),
  };
};

function Metabot({ user, metadata }) {
  const [question, setQuestion] = useState(null);

  return (
    <MetabotRoot>
      <AIPromptHeader user={user}></AIPromptHeader>
      <MetabotResultsPlaceholder src="app/img/metabot-results-placeholder.svg" />
      {question ? <div>light-weight native qb</div> : null}
    </MetabotRoot>
  );
}

export default _.compose(connect(mapStateToProps))(Metabot);
