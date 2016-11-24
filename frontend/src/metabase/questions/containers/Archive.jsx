import React, { Component, PropTypes } from "react";
import { connect } from "react-redux";

import Icon from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";
import HeaderWithBack from "metabase/components/HeaderWithBack";

import { selectSection } from "../questions";

const mapStateToProps = (state, props) => ({
    items: state.questions.entities.cards
})

const mapDispatchToProps = ({
    selectSection
})

const ArchivedItem = ({ name, display }) =>
    <div className="flex align-center">
        <Icon
            className=""
            name={display}
        />
        { name }
        <Tooltip tooltip="Unarchive this question">
            <Icon
                className="ml-auto cursor-pointer text-brand-hover"
                name="unarchive"
            />
        </Tooltip>
    </div>


@connect(mapStateToProps, mapDispatchToProps)
class Archive extends Component {
    componentWillMount () {
        this.props.selectSection('archived');
    }
    render () {
        const { items } = this.props;
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
