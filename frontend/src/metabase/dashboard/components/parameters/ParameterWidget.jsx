import React, { Component, PropTypes } from 'react';

import S from "./ParameterWidget.css";
import cx from "classnames";

export default class ParameterWidget extends Component {

    static propTypes = {
        parameter: PropTypes.object
    };

    static defaultProps = {
        parameter: null,
    }

    render() {
        const { className, parameter, isEditing, isSelected, onNameChange, setEditingParameter } = this.props;
        return (
            <div className={className}>
                { isEditing && isSelected && <div className="mb1">Give your filter a label</div>}
                { isEditing && isSelected ?
                    <div className={cx(S.parameter, { [S.selected]: true })}>
                        <input
                            type="text"
                            value={parameter.name}
                            onChange={(e) => onNameChange(e.target.value)}
                            autoFocus
                        />
                    </div>
                : isEditing && !isSelected ?
                    <div className={S.parameter} onClick={() => setEditingParameter(parameter.id)}>
                        {parameter.name}
                    </div>
                :
                    <div className={S.parameter}>
                        {parameter.name}
                    </div>
                }
            </div>
        );
    }
}
