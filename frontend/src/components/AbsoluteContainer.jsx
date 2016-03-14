import React, { Component, PropTypes } from "react";

export default ComposedComponent => class extends Component {
    render() {
        const { className, style, width, height } = this.props;
        return (
            <div className={className} style={{ position: "relative", ...style }}>
                <div style={{ position: "absolute", top: 0, left: 0, width: width, height: height }}>
                { width != null && height != null &&
                    <ComposedComponent
                        width={width}
                        height={height}
                        {...this.props}
                    />
                }
                </div>
            </div>
        );
    }
}
