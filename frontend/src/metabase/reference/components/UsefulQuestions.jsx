import React from "react";
import PropTypes from "prop-types";
import pure from "recompose/pure";
import { t } from "ttag";
import S from "./UsefulQuestions.css";
import D from "metabase/reference/components/Detail.css";

import QueryButton from "metabase/components/QueryButton";

const UsefulQuestions = ({ questions }) => (
  <div className={D.detail}>
    <div className={D.detailBody}>
      <div className={D.detailTitle}>
        <span className={D.detailName}>{t`Potentially useful questions`}</span>
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

export default pure(UsefulQuestions);
