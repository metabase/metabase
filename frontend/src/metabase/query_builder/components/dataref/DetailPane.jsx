/* eslint "react/prop-types": "warn" */
import React from "react";
import PropTypes from "prop-types";
import { t } from "c-3po";
import cx from "classnames";

const DetailPane = ({
  name,
  description,
  usefulQuestions,
  useForCurrentQuestion,
  extra,
}) => (
  <div>
    <h1>{name}</h1>
    <p className={cx({ "text-medium": !description })}>
      {description || t`No description set.`}
    </p>
    {useForCurrentQuestion && useForCurrentQuestion.length > 0 ? (
      <div className="py1">
        <p className="text-bold">{t`Use for current question`}</p>
        <ul className="my2">
          {useForCurrentQuestion.map((item, index) => (
            <li className="mt1" key={index}>
              {item}
            </li>
          ))}
        </ul>
      </div>
    ) : null}
    {usefulQuestions && usefulQuestions.length > 0 ? (
      <div className="py1">
        <p className="text-bold">{t`Potentially useful questions`}</p>
        <ul>
          {usefulQuestions.map((item, index) => (
            <li className="border-row-divider" key={index}>
              {item}
            </li>
          ))}
        </ul>
      </div>
    ) : null}
    {extra}
  </div>
);

DetailPane.propTypes = {
  name: PropTypes.string.isRequired,
  description: PropTypes.string,
  error: PropTypes.string,
  useForCurrentQuestion: PropTypes.array,
  usefulQuestions: PropTypes.array,
  extra: PropTypes.element,
};

export default DetailPane;
