import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";

export default ComposedComponent => class extends Component {
    constructor(props, context) {
        super(props, context);
        this.state = {
            width: null,
            height: null
        };
    }

    static propTypes = {
        className: PropTypes.any,
        style: PropTypes.object
    };

    static defaultProps = {
        className: ""
    };

    componentDidMount() {
        this.componentDidUpdate();
    }

    componentDidUpdate() {
        const { width, height } = ReactDOM.findDOMNode(this).getBoundingClientRect();
        if (this.state.width !== width || this.state.height !== height) {
            this.setState({ width, height });
        }
    }

    render() {
        const { className, style } = this.props;
        const { width, height } = this.state;
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
