import cxs from "cxs";
import React, { Component } from "react";
import { connect } from "react-redux";

import Card from "../components/Card";

import { setTip, selectAndAdvance, setDatabase } from "../actions";

import { getDatabases } from "metabase/selectors/metadata";

const mapStateToProps = state => ({
    databases: getDatabases(state),
    title: state.newQuestion.currentStep.title,
    tip: state.newQuestion.currentStep.tip
});

const mapDispatchToProps = {
    setTip,
    selectAndAdvance,
    setDatabase
};

@connect(mapStateToProps, mapDispatchToProps)
class MetricBuilder extends Component {
    constructor(props) {
        super(props);
        // keep a reference to the tip so that we don't lose it when showing
        // context specific tips
        this.tip = props.tip;
    }
    render() {
        const {
            databases,
            setTip,
            selectAndAdvance,
            setDatabase,
            title
        } = this.props;
        return (
            <div>
                <h2>{title}</h2>
                <ol className={cxs({ display: "flex", flexWrap: "wrap" })}>
                    {databases.map(db => (
                        <li
                            className={cxs({ flex: "0 0 33.33%" })}
                            key={db.id}
                            onMouseEnter={() => setTip({
                                title: db.name,
                                text: db.description
                            })}
                            onMouseLeave={() => setTip(this.tip)}
                            onClick={() =>
                                selectAndAdvance(() => setDatabase(db.id))}
                        >
                            <Card name={db.name} />
                        </li>
                    ))}
                </ol>
            </div>
        );
    }
}

export default MetricBuilder;
