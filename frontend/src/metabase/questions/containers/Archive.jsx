import React, { Component, PropTypes } from "react";
import { connect } from "react-redux";

import HeaderWithBack from "metabase/components/HeaderWithBack";

import ArchivedItem from "../components/ArchivedItem";
import { selectSection, setArchived } from "../questions";

import { getAllEntities } from "../selectors";

const mapStateToProps = (state, props) => ({
    // TODO - this should use a selector
    items: getAllEntities(state, props)
})

const mapDispatchToProps = ({
    selectSection,
    setArchived
})

@connect(mapStateToProps, mapDispatchToProps)
class Archive extends Component {
    componentWillMount () {
        this.props.selectSection('archived');
    }
    render () {
        const { items, setArchived } = this.props;
        // TODO - this should be its own presentational component
        return (
            <div className="mx4 mt4">
                <HeaderWithBack name="Archive" />
                <ol className="mt2">
                    {
                        items && items.map(item =>
                            <li
                                className="py1 border-bottom"
                                key={item.id}
                            >
                                <ArchivedItem { ...item } onUnarchive={() => setArchived(item.id, false)} />
                            </li>
                        )
                    }
                </ol>
            </div>
        )
    }
}

export default Archive;
