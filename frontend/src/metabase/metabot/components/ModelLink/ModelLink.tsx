import * as Urls from "metabase/lib/urls";
import Question from "metabase-lib/Question";
import { ModelLinkRoot } from "./ModelLink.styled";

interface ModelLinkProps {
  model: Question;
}

const ModelLink = ({ model }: ModelLinkProps) => {
  return (
    <ModelLinkRoot to={Urls.question(model.card())}>
      {model.displayName()}
    </ModelLinkRoot>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ModelLink;
