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
    constructor(props, context) {
        super(props, context);
        this.state = {};
    }

    static propTypes = {};
    static defaultProps = {};

    render() {
        let { item, setItemSelected, setFavorited, setArchived } = this.props;
        return (
            <li style={{ display: item.visible ? undefined : "none" }}>
                <Item
                    id={item.id}
                    name={item.name}
                    created={item.created}
                    by={item.by}
                    favorite={item.favorite}
                    archived={item.archived}
                    icon={item.icon}
                    selected={item.selected}
                    labels={item.labels}
                    setItemSelected={setItemSelected}
                    setFavorited={setFavorited}
                    setArchived={setArchived}
                />
            </li>
        )
    }
}
