import React, { Component, PropTypes } from "react";

import { formatScalar } from "metabase/lib/formatting";

export default class ScalarCard extends Component {
    static propTypes = {
        data: PropTypes.object.isRequired
    };

    static defaultProps = {
        className: ""
    };

    render() {
        return (
            <div className={"Card--scalar " + this.props.className}>
                <h1 className="Card-scalarValue text-normal">{formatScalar(this.props.data.rows[0][0])}</h1>
            </div>
        );
    }
}
