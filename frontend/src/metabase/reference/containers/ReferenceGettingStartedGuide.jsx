/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from "react";

import S from "metabase/reference/Reference.css";

import { pure } from "recompose";

const ReferenceGettingStartedGuide = () =>
    <div className={S.guideEmpty}>
        <div className={S.guideEmptyBody}>
            <img className="mb4" src={`/app/img/lightbulb.png`} height="200px" alt="Lightbulb" srcSet={`/app/img/lightbulb@2x.png 2x`} />
            <h1 className="text-bold text-dark">Understanding our data</h1>
            <div className={S.guideEmptyMessage}>This guide lets you explore all the metrics, segments, and raw data that we currently have in Metabase. Select a section on the left to learn more about our data.</div>
        </div>
    </div>

export default pure(ReferenceGettingStartedGuide);
