import React, { Component, PropTypes } from "react";
// FIXME: using pure seems to mess with redux form updates
// import pure from "recompose/pure";
import cx from "classnames";
import i from "icepick";

import S from "./GuideDetailEditor.css";

import Select from "metabase/components/Select.jsx";

const GuideDetailEditor = ({
    type,
    entities,
    formField
}) => 
    <div className={S.guideDetailEditor}>
        <div className={S.guideDetailEditorPicker}>
            <Select 
                triggerClasses={S.guideDetailEditorSelect}
                value={entities[formField.id.value]}
                options={Object.values(entities)}
                optionNameFn={option => option.display_name || option.name}
                onChange={(entity) => {
                    formField.id.onChange(entity.id);
                    formField.points_of_interest.onChange(entity.points_of_interest || '');
                    formField.caveats.onChange(entity.caveats || '');
                }}
                placeholder={`Pick a ${type}`}
            />
        </div>
        <div className={S.guideDetailEditorBody}>
            <textarea 
                className={S.guideDetailEditorTextarea}
                placeholder={
                    type === 'dashboard' ?
                        `Why is this dashboard the most important?` :
                        `What is useful or interesting about this ${type}?` 
                }
                {...formField.points_of_interest}
                disabled={formField.id.value === null || formField.id.value === undefined}
            />
            <textarea 
                className={S.guideDetailEditorTextarea} 
                placeholder={
                    type === 'dashboard' ?
                        `Is there anything users of this dashboard should be aware of?` :
                        `Anything users should be aware of about this ${type}?` 
                }
                {...formField.caveats}
                disabled={formField.id.value === null || formField.id.value === undefined}                
            />
        </div>
    </div>;
GuideDetailEditor.propTypes = {
    type: PropTypes.string.isRequired,
    entities: PropTypes.object.isRequired,
    formField: PropTypes.object.isRequired
};

export default GuideDetailEditor;
