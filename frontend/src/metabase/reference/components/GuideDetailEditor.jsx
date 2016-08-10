import React, { Component, PropTypes } from "react";
// FIXME: using pure seems to mess with redux form updates
// import pure from "recompose/pure";
import cx from "classnames";
import i from "icepick";

import S from "./GuideDetailEditor.css";

import Select from "metabase/components/Select.jsx";
import Icon from "metabase/components/Icon.jsx";

const GuideDetailEditor = ({
    className,
    type,
    entities,
    selectedIds = [],
    formField,
    removeField
}) => 
    <div className={cx(S.guideDetailEditor, className)}>
        <div className={S.guideDetailEditorClose}>
            <Icon
                name="close"
                width={24}
                height={24}
                onClick={removeField}
            />
        </div>
        <div className={S.guideDetailEditorPicker}>
            <Select 
                triggerClasses={S.guideDetailEditorSelect}
                value={entities[formField.id.value]}
                options={Object.values(entities)
                    .filter(entity =>
                        entity.id === formField.id.value ||
                        !selectedIds.includes(entity.id)
                    )
                }
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
    className: PropTypes.string,
    type: PropTypes.string.isRequired,
    entities: PropTypes.object.isRequired,
    selectedIds: PropTypes.array.isRequired,
    formField: PropTypes.object.isRequired,
    removeField: PropTypes.func.isRequired
};

export default GuideDetailEditor;
