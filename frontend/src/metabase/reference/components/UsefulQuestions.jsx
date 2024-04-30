import PropTypes from "prop-types";
import { memo } from "react";
import { t } from "ttag";

import QueryButton from "metabase/components/QueryButton";
import D from "metabase/reference/components/Detail.module.css";

import S from "./UsefulQuestions.module.css";

const UsefulQuestions = ({ questions }) => (
  <div className={D.detail}>
    <div className={D.detailBody}>
      <div className={D.detailTitle}>
        <span>{t`Potentially useful questions`}</span>
      </div>
      <div className={S.usefulQuestions}>
        {questions.map((question, index, questions) => (
          <QueryButton key={index} {...question} />
        ))}
      </div>
    </div>
  </div>
);
UsefulQuestions.propTypes = {
  questions: PropTypes.array.isRequired,
};

export default memo(UsefulQuestions);
