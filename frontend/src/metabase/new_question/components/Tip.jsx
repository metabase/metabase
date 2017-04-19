import cxs from "cxs";
import React, { Component } from "react";

import Title from "metabase/components/Title";
import Text from "metabase/components/Text";

class Tip extends Component {
    render() {
        const { tip: { title, text } } = this.props;
        return (
            <div>
                <Title>
                    {title}
                </Title>
                <Text>{text}</Text>
            </div>
        );
    }
}

export default Tip;
