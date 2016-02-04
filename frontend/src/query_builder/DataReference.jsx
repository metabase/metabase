import React, { Component, PropTypes } from "react";

import DataReferenceMain from './DataReferenceMain.jsx';
import DataReferenceTable from './DataReferenceTable.jsx';
import DataReferenceField from './DataReferenceField.jsx';
import Icon from "metabase/components/Icon.jsx";

export default class DataReference extends Component {
    constructor(props, context) {
        super(props, context);
        this.back = this.back.bind(this);
        this.close = this.close.bind(this);
        this.showField = this.showField.bind(this);
        this.showTable = this.showTable.bind(this);

        this.state = {
            stack: [],
            tables: {},
            fields: {}
        };
    }

    static propTypes = {
        Metabase: PropTypes.func.isRequired,
        query: PropTypes.object.isRequired,
        closeFn: PropTypes.func.isRequired,
        runQueryFn: PropTypes.func.isRequired,
        setQueryFn: PropTypes.func.isRequired,
        setDatabaseFn: PropTypes.func.isRequired,
        setSourceTableFn: PropTypes.func.isRequired,
        setDisplayFn: PropTypes.func.isRequired
    };

    close() {
        this.props.closeFn();
    }

    back() {
        this.setState({
            stack: this.state.stack.slice(0, -1)
        });
    }

    showField(field) {
        this.setState({
            stack: this.state.stack.concat({ type: "field", field: field })
        });
    }

    showTable(table) {
        this.setState({
            stack: this.state.stack.concat({ type: "table", table: table })
        });
    }

    render() {
        var content;
        if (this.state.stack.length === 0) {
            content = <DataReferenceMain {...this.props} showTable={this.showTable} />
        } else {
            var page = this.state.stack[this.state.stack.length - 1];
            if (page.type === "table") {
                content = <DataReferenceTable {...this.props} table={page.table} showField={this.showField} />
            } else if (page.type === "field") {
                content = <DataReferenceField {...this.props} field={page.field}/>
            }
        }

        var backButton;
        if (this.state.stack.length > 0) {
            backButton = (
                <a className="flex align-center mb2 text-default text-brand-hover no-decoration" onClick={this.back}>
                    <Icon name="chevronleft" width="18px" height="18px" />
                    <span className="text-uppercase">Back</span>
                </a>
            )
        }

        var closeButton = (
            <a className="flex-align-right text-default text-brand-hover no-decoration" onClick={this.close}>
                <Icon name="close" width="18px" height="18px" />
            </a>
        );

        return (
            <div className="DataReference-container p3 scroll-y">
                <div className="DataReference-header flex mb1">
                    {backButton}
                    {closeButton}
                </div>
                <div className="DataReference-content">
                    {content}
                </div>
            </div>
        );
    }
}
