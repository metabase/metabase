import React, { Component, PropTypes } from "react";
import { connect } from "react-redux";

import HeaderWithBack from "metabase/components/HeaderWithBack";

import ArchivedItem from "../components/ArchivedItem";
import { selectSection } from "../questions";

const mapStateToProps = (state, props) => ({
    // TODO - this should use a selector
    items: state.questions.entities.cards
})

const mapDispatchToProps = ({
    selectSection
})

@connect(mapStateToProps, mapDispatchToProps)
class Archive extends Component {
    componentWillMount () {
        this.props.selectSection('archived');
    }
    render () {
        const { items } = this.props;
        // TODO - this should be its own presentational component
        return (
            <div className="mx4 mt4">
                <HeaderWithBack name="Archive" />
                <ol className="mt2">
                    {
                        items && Object.keys(items).map((key, index) =>
                            <li
                                className="py1 border-bottom"
                                key={index}
                            >
                                <ArchivedItem { ...items[key] }  />
                            </li>
                        )
                    }
                </ol>
            </div>
        )
    }
}

export default Archive;
