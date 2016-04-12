import React, { Component, PropTypes } from "react";
import { connect } from "react-redux";

import Item from "../components/Item.jsx";

import * as questionsActions from "../questions";
import { makeGetItem } from "../selectors";

// const mapStateToProps = (state, props) => {
//   return {
//       item: getItem(state, props)
//   }
// }

const makeMapStateToProps = () => {
    const getItem = makeGetItem()
    const mapStateToProps = (state, props) => {
        return {
            item: getItem(state, props)
        };
    };
    return mapStateToProps;
}

@connect(makeMapStateToProps, questionsActions)
export default class EntityItem extends Component {
    constructor(props, context) {
        super(props, context);
        this.state = {};
    }

    static propTypes = {};
    static defaultProps = {};

    render() {
        let { item, setItemSelected } = this.props;
        return (
            <li style={{ display: item.visible ? undefined : "none" }}>
                <Item
                    id={item.id}
                    name={item.name}
                    created={item.created}
                    by={item.by}
                    favorite={item.favorite}
                    icon={item.icon}
                    selected={item.selected}
                    labels={item.labels}
                    setItemSelected={setItemSelected}
                />
            </li>
        )
    }
}
