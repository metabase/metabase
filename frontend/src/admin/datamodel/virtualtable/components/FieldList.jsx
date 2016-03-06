import React, { Component, PropTypes } from "react";

import CheckBox from "metabase/components/CheckBox.jsx";
import Icon from "metabase/components/Icon.jsx";

import _ from "underscore";


export default class FieldList extends Component {

    static propTypes = {
        fields: PropTypes.array.isRequired,
        isChecked: PropTypes.func,
        onToggleChecked: PropTypes.func,
        canAction: PropTypes.func,
        onAction: PropTypes.func
    };

    static defaultProps = {
        isChecked: () => false,
        canAction: () => false
    };

    onToggleChecked(field, checked) {
        if (this.props.onToggleChecked) {
            this.props.onToggleChecked(field, checked);
        }
    }

    onActionField(field) {
        console.log("actionField", field);
        if (this.props.onAction) {
            this.props.onAction(field);
        }
    }

    render() {
        const { fields, canAction, isChecked } = this.props;

        if (!fields) return;

        // reorderable?

        return (
            <ul className="scroll-y scroll-show">
                { fields.map((field, idx) =>
                    <li key={field.id || "f"+idx} className="pb1 flex align-center justify-between">
                        { isChecked(field) ?
                            <div className="text-brand flex flex-row">
                                <CheckBox borderColor="#509EE3" borderSize="1px" checked={true} onChange={(e) => this.onToggleChecked(field, e.target.checked)} />
                                <span className="pl1 text-default">{field.display_name}</span>
                            </div>
                        :
                            <div className="text-grey-2 flex flex-row">
                                <CheckBox borderSize="1px" checked={false} onChange={(e) => this.onToggleChecked(field, e.target.checked)} />
                                <span className="pl1">{field.display_name}</span>
                            </div>
                        }
                        { canAction && canAction(field) ? <div onClick={() => this.onActionField(field)}><Icon name="pencil" width="12" height="12" /></div> : null }
                    </li>
                )}
            </ul>
        );
    }
}
