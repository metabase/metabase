import React from "react";
import PropTypes from "prop-types";
import cx from "classnames";
import pure from "recompose/pure";
import { t } from "c-3po";
import S from "./UsefulQuestions.css";
import D from "metabase/reference/components/Detail.css";
import L from "metabase/components/List.css";

import QueryButton from "metabase/components/QueryButton.jsx";

const UsefulQuestions = ({ questions }) => (
  <div className={cx(D.detail)}>
    <div className={D.detailBody}>
      <div className={D.detailTitle}>
        <span className={D.detailName}>{t`Potentially useful questions`}</span>
      </div>
      <div className={S.usefulQuestions}>
        {questions.map((question, index, questions) => (
          <QueryButton
            key={index}
            className={cx("border-bottom", "pt1", "pb1")}
            iconClass={L.icon}
            {...question}
          />
        ))}
      </div>
    </div>
  </div>
);
UsefulQuestions.propTypes = {
  questions: PropTypes.array.isRequired,
};

export default pure(UsefulQuestions);
