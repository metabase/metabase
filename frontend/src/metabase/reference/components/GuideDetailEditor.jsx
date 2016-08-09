import React, { Component, PropTypes } from "react";
// FIXME: using pure seems to mess with redux form updates
// import pure from "recompose/pure";
import cx from "classnames";
import i from "icepick";

import S from "./GuideDetailEditor.css";

import Select from "metabase/components/Select.jsx";

const GuideDetailEditor = ({
    type,
    secondaryType,
    entities,
    secondaryEntities,
    formField
}) => 
    <div className={S.guideDetailEditor}>
        <div className={S.guideDetailEditorPicker}>
            <Select 
                triggerClasses={S.guideDetailEditorSelect}
                value={formField.type && secondaryType === formField.type.value ?
                    secondaryEntities[formField.id.value] : 
                    entities[formField.id.value]
                }
                options={secondaryType ?
                    Object.values(entities)
                        .map(entity => i.assoc(entity, 'section', type))
                        .concat(
                            Object.values(secondaryEntities)
                                .map(entity => i.assoc(entity, 'section', secondaryType))
                        ) :
                    Object.values(entities)
                }
                optionNameFn={option => option.display_name || option.name}
                onChange={(entity) => {
                    formField.id.onChange(entity.id);
                    if (secondaryType) {
                        formField.type.onChange(entity.section);
                    }
                    formField.points_of_interest.onChange(entity.points_of_interest || '');
                    formField.caveats.onChange(entity.caveats || '');
                }}
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
                {...formField.points_of_interest}
                value={formField.points_of_interest.value || ''}
            />
            <textarea 
                className={S.guideDetailEditorTextarea} 
                placeholder={
                    type === 'dashboard' ?
                        `Is there anything users of this dashboard should be aware of?` :
                        `Anything users should be aware of about this ${type}${secondaryType ? ` or ${secondaryType}` : ''}?` 
                }
                {...formField.caveats}
                value={formField.caveats.value || ''}
            />
        </div>
    </div>;
GuideDetailEditor.propTypes = {
    type: PropTypes.string.isRequired,
    secondaryType: PropTypes.string,
    entities: PropTypes.object.isRequired,
    secondaryEntities: PropTypes.object,
    formField: PropTypes.object.isRequired
};

export default GuideDetailEditor;
