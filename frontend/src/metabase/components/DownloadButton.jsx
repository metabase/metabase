import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";

import Button from "metabase/components/Button.jsx";

export default class DownloadButton extends Component {
    constructor(props, context) {
        super(props, context);
        this.state = {};
    }

    static propTypes = {
        url: PropTypes.string.isRequired,
        method: PropTypes.string,
        params: PropTypes.object,
        icon: PropTypes.string,
    };

    static defaultProps = {
        icon: "downarrow",
        method: "POST",
        params: {}
    };

    render() {
        const { children, url, method, params, ...props } = this.props;
        return (
            <form ref={(c) => this._form = c} method={method} action={url}>
                { Object.entries(params).map(([name, value]) =>
                    <input key={name} type="hidden" name={name} value={value} />
                )}
                <Button
                    onClick={() => ReactDOM.findDOMNode(this._form).submit()}
                    {...props}
                >
                    {children}
                </Button>
            </form>
        );
    }
}
