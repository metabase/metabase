/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";
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
        setArchived:        PropTypes.func.isRequired,
        editable:           PropTypes.bool,
        showCollectionName: PropTypes.bool,
        onEntityClick:      PropTypes.func,
        onMove:             PropTypes.func,
    };

    render() {
        let { item, editable, setItemSelected, setFavorited, setArchived, onMove, onEntityClick, showCollectionName } = this.props;
        return (
            <li className="relative" style={{ display: item.visible ? undefined : "none" }}>
                <Item
                    setItemSelected={editable ? setItemSelected : null}
                    setFavorited={editable ? setFavorited : null}
                    setArchived={editable ? setArchived : null}
                    onMove={editable ? onMove : null}
                    onEntityClick={onEntityClick}
                    showCollectionName={showCollectionName}
                    entity={item}
                    {...item}
                />
            </li>
        )
    }
}
