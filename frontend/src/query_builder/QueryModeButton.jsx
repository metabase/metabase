import React, { Component, PropTypes } from "react";

import cx from "classnames";
import { formatSQL } from "metabase/lib/formatting";
import Icon from "metabase/components/Icon.jsx";
import Modal from "metabase/components/Modal.jsx";
import Tooltip from "metabase/components/Tooltip.jsx";


export default class QueryModeButton extends Component {

    constructor(props, context) {
        super(props, context);

        this.state = {
            isOpen: false,
        };
    }

    static propTypes = {
        mode: PropTypes.string.isRequired,
        allowNativeToQuery: PropTypes.bool,
        nativeForm: PropTypes.object,
        onSetMode: PropTypes.func.isRequired
    };

    static defaultProps = {
        allowNativeToQuery: false
    }

    render() {
        const { allowNativeToQuery, mode, nativeForm, onSetMode } = this.props;

        // determine the type to switch to based on the type
        var targetType = (mode === "query") ? "native" : "query";

        // maybe switch up the icon based on mode?
        let onClick = null;
        let tooltip = "Not Supported";
        if (mode === "query") {
            onClick = nativeForm ? () => this.setState({isOpen: true}) : () => onSetMode("native");
            tooltip = nativeForm ? "View the SQL" : "Switch to SQL";
        } else if (mode === "native" && allowNativeToQuery) {
            onClick = () => onSetMode("query");
            tooltip = "Switch to Builder";
        }

        return (
            <div>
                <Tooltip tooltip={tooltip}>
                    <span data-metabase-event={"QueryBuilder;Toggle Mode"} className={cx("cursor-pointer", {"text-brand-hover": onClick, "text-grey-1": !onClick})} onClick={onClick}>
                        <Icon name="sql" width="16px" height="16px" />
                    </span>
                </Tooltip>

                <Modal className="Modal Modal--medium" backdropClassName="Modal-backdrop-dark" isOpen={this.state.isOpen} onClose={() => this.setState({isOpen: false})}>
                    <div className="p4">
                        <div className="mb3 flex flex-row flex-full align-center justify-between">
                            <h2>SQL for this question</h2>
                            <span className="cursor-pointer" onClick={() => this.setState({isOpen: false})}><Icon name="close" width="16px" height="16px" /></span>
                        </div>

                        <pre className="mb3 p2 sql-code">
                            {nativeForm && nativeForm.query && formatSQL(nativeForm.query)}
                        </pre>

                        <div className="text-centered">
                            <a className="Button Button--primary" onClick={() => {
                                onSetMode(targetType);
                                this.setState({isOpen: false});
                            }}>Convert this question to SQL</a>
                        </div>
                    </div>
                </Modal>
            </div>
        );
    }
}
