import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon.jsx";

import _ from "underscore";

export default class PulseCardPreview extends Component {
    constructor(props, context) {
        super(props, context);

        this.state = {
            height: 0
        };

        _.bindAll(this, "onFrameLoad");
    }

    static propTypes = {
        card: PropTypes.object.isRequired,
        onRemove: PropTypes.func.isRequired
    };

    onFrameLoad() {
        // set the height based on the content
        try {
            let height = React.findDOMNode(this.refs.iframe).contentWindow.document.body.scrollHeight;
            this.setState({ height });
        } catch (e) {
        }
    }

    render() {
        let { card } = this.props;
        return (
            <div className="flex relative flex-full">
                <a className="text-grey-2 absolute" style={{ top: "15px", right: "15px" }} onClick={this.props.onRemove}>
                    <Icon name="close" width={16} height={16} />
                </a>
                <iframe className="bordered rounded flex-full" height={this.state.height} ref="iframe" src={"/api/pulse/preview_card/" + card.id} onLoad={this.onFrameLoad} />
            </div>
        );
    }
}
