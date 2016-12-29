/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from "react";
import { connect } from "react-redux";

import Item from "../components/Item.jsx";

import { setItemSelected, setFavorited, setArchived } from "../questions";
import { makeGetItem } from "../selectors";

const makeMapStateToProps = () => {
    const getItem = makeGetItem()
    const mapStateToProps = (state, props) => {
        return {
            item: getItem(state, props)
        };
    };
    return mapStateToProps;
}

const mapDispatchToProps = {
    setItemSelected,
    setFavorited,
    setArchived
};

@connect(makeMapStateToProps, mapDispatchToProps)
export default class EntityItem extends Component {
    static propTypes = {
        item:               PropTypes.object.isRequired,
        setItemSelected:    PropTypes.func.isRequired,
        setFavorited:       PropTypes.func.isRequired,
        setArchived:        PropTypes.func.isRequired
    };

    render() {
        let { item, setItemSelected, setFavorited, setArchived } = this.props;
        return (
            <li className="relative" style={{ display: item.visible ? undefined : "none" }}>
                <Item
                    setItemSelected={setItemSelected}
                    setFavorited={setFavorited}
                    setArchived={setArchived}
                    {...item}
                />
            </li>
        )
    }
}
