import React, { Component, PropTypes } from "react";
import pure from "recompose/pure";

import S from "./GuideEmptyState.css";

const GuideEmptyState = ({
    isSuperuser,
    startEditing
}) =>
    <div className={S.guideEmpty}>
        <div className={S.guideEmptyWrapper}>
            <div className={S.guideEmptyBody}>
                <img className="mb4" src={`/app/img/lightbulb.png`} height="200px" alt="Lightbulb" srcSet={`/app/img/lightbulb@2x.png 2x`} />
                <h1 className="text-bold text-dark">Understanding our data</h1>
                <span className={S.guideEmptyMessage}>This guide lets you explore all the metrics, segments, and raw data that we currently have in Metabase. Select a section on the left to learn more about our data.</span>
            </div>
            { isSuperuser && 
                <div className={S.guideEmptyAction}>
                    <button className="Button Button--large Button--primary" onClick={startEditing}>Create a custom Getting Started guide</button>
                </div>
            }
        </div>
    </div>;
GuideEmptyState.propTypes = {
    isSuperuser: PropTypes.bool.isRequired,
    startEditing: PropTypes.func.isRequired
};

export default pure(GuideEmptyState);


