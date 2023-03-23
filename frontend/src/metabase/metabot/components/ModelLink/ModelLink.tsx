import React from "react";
import * as Urls from "metabase/lib/urls";
import Question from "metabase-lib/Question";
import {
  ModelLinkIcon,
  ModelLinkRoot,
  ModelLinkText,
} from "./ModelLink.styled";

interface ModelLinkProps {
  model: Question;
}

const ModelLink = ({ model }: ModelLinkProps) => {
  return (
    <ModelLinkRoot to={Urls.question(model.card())}>
      <ModelLinkIcon name="model" />
      <ModelLinkText>{model.displayName()}</ModelLinkText>
    </ModelLinkRoot>
  );
};

export default ModelLink;
