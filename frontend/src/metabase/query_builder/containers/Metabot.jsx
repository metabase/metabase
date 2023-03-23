/* eslint-disable react/prop-types */
import React, { useState } from "react";
import { connect } from "react-redux";

import _ from "underscore";
import { MetabotApi } from "metabase/services";

import { getMetadata } from "metabase/selectors/metadata";
import { getUser } from "metabase/selectors/user";
import Questions from "metabase/entities/questions";

import AIPromptHeader from "../components/AIPromptHeader";
import { MetabotResultsPlaceholder, MetabotRoot } from "./Metabot.styled";

const mapStateToProps = (state, props) => {
  return {
    user: getUser(state, props),
    metadata: getMetadata(state, props),
  };
};

function Metabot({ user, metadata, modelCard }) {
  const [result, setResult] = useState(null);

  const handleRun = async prompt => {
    const result = await MetabotApi.modelPrompt({
      "source-model": modelCard.id,
      question: prompt,
    });

    setResult(result.sql_query);
  };

  return (
    <MetabotRoot>
      <AIPromptHeader
        user={user}
        model={modelCard}
        onRun={handleRun}
      ></AIPromptHeader>
      {result ? (
        result
      ) : (
        <MetabotResultsPlaceholder src="app/img/metabot-results-placeholder.svg" />
      )}
    </MetabotRoot>
  );
}

export default _.compose(
  Questions.load({
    id: (_state, { params }) =>
      params.modelId == null ? undefined : parseInt(params.modelId),
    entityAlias: "modelCard",
  }),
  connect(mapStateToProps),
)(Metabot);
