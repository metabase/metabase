import cxs from "cxs";
import React, { Component } from "react";

import Text from "../components/Text";

class Tip extends Component {
    render() {
        const { tip: { title, text } } = this.props;
        return (
            <div>
                <h3 className="mb2">Tip</h3>
                <div
                    className={
                        `p4 ${cxs({
                            border: "1px solid #DCE1E4",
                            borderRadius: 4
                        })}`
                    }
                >
                    <h3>{title}</h3>
                    <Text>{text}</Text>
                </div>
            </div>
        );
    }
}

export default Tip;
