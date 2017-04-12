import cxs from "cxs";
import React, { Component } from "react";

import Text from "metabase/components/Text";

class Tip extends Component {
    render() {
        const { tip: { title, text } } = this.props;
        return (
            <div>
                <h3 className={cxs({ marginBottom: "1em" })}>
                    {title}
                </h3>
                <Text>{text}</Text>
            </div>
        );
    }
}

export default Tip;
