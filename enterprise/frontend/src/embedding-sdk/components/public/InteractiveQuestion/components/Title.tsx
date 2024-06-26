import cx from "classnames";

import { useInteractiveQuestionContext } from "embedding-sdk/components/public/InteractiveQuestion/context/context";
import CS from "metabase/css/core/index.css";

export const Title = () => {
  const { customTitle, question, withTitle } = useInteractiveQuestionContext();

  return (
    question &&
    withTitle &&
    (customTitle || (
      <h2 className={cx(CS.h2, CS.textWrap)}>{question.displayName()}</h2>
    ))
  );
};
