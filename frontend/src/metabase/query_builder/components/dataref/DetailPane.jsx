/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from "react";

import cx from "classnames";

const DetailPane = ({ name, description, error, usefulQuestions, useForCurrentQuestion, extra }) =>
    <div>
        <h1>{name}</h1>
        <p className={cx({ "text-grey-3": !description })}>
            {description || "No description set."}
        </p>
        { useForCurrentQuestion && useForCurrentQuestion.length > 0 ?
            <div className="py1">
                <p className="text-bold">Use for current question</p>
                <ul className="my2">
                {useForCurrentQuestion.map((item, index) =>
                    <li className="mt1" key={index}>
                        {item}
                    </li>
                )}
                </ul>
            </div>
        : null }
        { usefulQuestions && usefulQuestions.length > 0 ?
            <div className="py1">
                <p className="text-bold">Potentially useful questions</p>
                <ul>
                {usefulQuestions.map((item, index) =>
                    <li className="border-row-divider" key={index}>
                        {item}
                    </li>
                )}
                </ul>
            </div>
        : null }
        {extra}
        <div>{error}</div>
    </div>

DetailPane.propTypes = {
    name: PropTypes.string.isRequired,
    description: PropTypes.string,
    error: PropTypes.string,
    useForCurrentQuestion: PropTypes.array,
    usefulQuestions: PropTypes.array,
    extra: PropTypes.element
}

export default DetailPane;
