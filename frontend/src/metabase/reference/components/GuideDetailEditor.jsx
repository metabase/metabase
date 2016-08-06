import React, { Component, PropTypes } from "react";
import pure from "recompose/pure";
import cx from "classnames";
import i from "icepick";

import S from "./GuideDetailEditor.css";

import Select from "metabase/components/Select.jsx";

const GuideDetailEditor = ({
    type,
    secondaryType,
    entities,
    secondaryEntities,
    formFields,
    secondaryFormFields
}) =>
    <div className={S.guideDetailEditor}>
        <div className={S.guideDetailEditorPicker}>
            <Select 
                triggerClasses={S.guideDetailEditorSelect}
                options={secondaryType ?
                    Object.values(entities)
                        .map(entity => i.assoc(entity, 'section', type))
                        .concat(
                            Object.values(secondaryEntities)
                                .map(entity => i.assoc(entity, 'section', secondaryType))
                        ) :
                    Object.values(entities)
                }
                placeholder={`Pick a ${type}${secondaryType ? ` or ${secondaryType}` : ''}`}
            />
        </div>
        <div className={S.guideDetailEditorBody}>
            <textarea 
                className={S.guideDetailEditorTextarea} 
                placeholder={
                    type === 'dashboard' ?
                        `Why is this dashboard the most important?` :
                        `What is useful or interesting about this ${type}${secondaryType ? ` or ${secondaryType}` : ''}?` 
                }
            />
            <textarea 
                className={S.guideDetailEditorTextarea} 
                placeholder={
                    type === 'dashboard' ?
                        `Is there anything users of this dashboard should be aware of?` :
                        `Anything users should be aware of about this ${type}${secondaryType ? ` or ${secondaryType}` : ''}?` 
                }
            />
        </div>
    </div>;
GuideDetailEditor.propTypes = {
    type: PropTypes.string.isRequired,
    secondaryType: PropTypes.string,
    entities: PropTypes.object.isRequired,
    secondaryEntities: PropTypes.object,
    formFields: PropTypes.object.isRequired,
    secondaryFormFields: PropTypes.object
};

export default pure(GuideDetailEditor);
