import cx from "classnames";
import cxs from "cxs";
import React, { Component } from "react";
import { connect } from "react-redux";

import Button from "metabase/components/Button";

import { advanceStep } from "../actions";
import { Sidebar } from "../components/Layout";

import WorldMapPreview from "../components/WorldMapPreview";
import USStateMapPreview from "../components/USStateMapPreview";

const MAP_OPTIONS = [
    { name: "World", key: "world", component: WorldMapPreview },
    { name: "US State", key: "us", component: USStateMapPreview }
];

const mapStateToProps = state => ({
    title: state.newQuestion.currentStep.title
});

const mapDispatchToProps = {
    advanceStep
};

@connect(mapStateToProps, mapDispatchToProps)
class MapLanding extends Component {
    constructor() {
        super();
        this.state = {
            selectedMap: MAP_OPTIONS[0]
        };
    }
    render() {
        const { advanceStep, title } = this.props;
        const Preview = this.state.selectedMap.component;
        return (
            <div className="flex">
                <div className={cxs({ flex: 1 })}>
                    <div className={cxs({ display: "flex" })}>
                        <h3>{title}</h3>
                        <Button
                            className="ml-auto"
                            onClick={() => advanceStep()}
                            primary
                        >
                            Next
                        </Button>
                    </div>
                    <div
                        className={cxs({
                            flex: 1,
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center"
                        })}
                    >
                        <Preview />
                    </div>
                </div>
                <Sidebar>
                    <ol className={cxs({ marginTop: 200 })}>
                        {// lol
                        MAP_OPTIONS.map((map, index) => (
                            <li
                                onClick={() =>
                                    this.setState({ selectedMap: map })}
                                className={cx({
                                    "text-brand": this.state.selectedMap === map
                                })}
                                key={index}
                            >
                                <h2>{map.name}</h2>
                            </li>
                        ))}
                    </ol>
                </Sidebar>
            </div>
        );
    }
}

export default MapLanding;
