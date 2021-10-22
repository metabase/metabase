/* eslint-disable react/prop-types */
import React from "react";
import { t } from "ttag";
import cx from "classnames";

import Toggle from "metabase/components/Toggle";

const QuestionPreviewToggle = ({
  isPreviewing,
  setIsPreviewing,
  className,
  ...props
}) => (
  <span className={cx(className, "flex align-center text-dark")}>
    {t`Preview`}
    <Toggle className="ml1" value={isPreviewing} onChange={setIsPreviewing} />
  </span>
);

export default QuestionPreviewToggle;
