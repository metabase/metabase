import cx from "classnames";
import cxs from "cxs";
import React, { Component } from "react";
import { connect } from "react-redux";

import Button from "metabase/components/Button";

import { selectAndAdvance, setMap } from "../actions";
import { Sidebar } from "../components/Layout";
import { getTablesByMapType } from "../selectors";

import WorldMapPreview from "../components/WorldMapPreview";
import USStateMapPreview from "../components/USStateMapPreview";

const MAP_OPTIONS = [
    { name: "World", key: "world_countries", component: WorldMapPreview },
    { name: "US State", key: "us_states", component: USStateMapPreview }
];

const getMapOptions = (tablesByMapType) =>
    MAP_OPTIONS.filter(option => tablesByMapType[option.key]);

const mapStateToProps = state => ({
    title: state.newQuestion.currentStep.title,
    tablesByMapType: getTablesByMapType(state)
});

const mapDispatchToProps = {
    selectAndAdvance,
    setMap
};

@connect(mapStateToProps, mapDispatchToProps)
class MapLanding extends Component {
    constructor(props) {
        super(props);
        this.state = {
            selectedMap: getMapOptions(props.tablesByMapType)[0]
        };
    }
    render() {
        const { selectAndAdvance, setMap, title, tablesByMapType } = this.props;
        const Preview = this.state.selectedMap.component;
        return (
            <div className="flex">
                <div className={cxs({ flex: 1 })}>
                    <div className={cxs({ display: "flex" })}>
                        <h3>{title}</h3>
                        <Button
                            className="ml-auto"
                            onClick={() => selectAndAdvance(() => setMap(this.state.selectedMap.key))}
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
                        getMapOptions(tablesByMapType).map((map, index) => (
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
