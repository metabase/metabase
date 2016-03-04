import React, { Component, PropTypes } from "react";

import Input from "metabase/components/Input.jsx";


export default class NameAndDescription extends Component {

    static propTypes = {
        name: PropTypes.string,
        description: PropTypes.string,
        namePlaceholder: PropTypes.string,
        descriptionPlaceholder: PropTypes.string,
        disabled: PropTypes.bool,
        onChange: PropTypes.func.isRequired
    };

    static defaultProps = {
        namePlaceholder: "name",
        descriptionPlaceholder: "No description yet",
        disabled: false
    };

    onChange(attribute, value) {
        if (attribute === "name") {
            this.props.onChange(value, this.props.description);
        } else {
            this.props.onChange(this.props.name, value);
        }
    }

    render() {
        const { name, description, disabled, namePlaceholder, descriptionPlaceholder } = this.props;

        return (
            <div className="Header-title flex flex-column flex-full bordered rounded">
                <Input className="AdminInput text-bold border-bottom rounded-top h3" type="text" value={name} onChange={(e) => this.onChange("name", e.target.value)} placeholder={namePlaceholder} disabled={disabled} />
                <Input className="AdminInput rounded-bottom h4" type="text" value={description} onChange={(e) => this.onChange("description", e.target.value)} placeholder={descriptionPlaceholder} disabled={disabled} />
            </div>
        );
    }
}
