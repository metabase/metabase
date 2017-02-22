/* @flow */
import React, { Component, PropTypes } from "react";
import { connect } from "react-redux";

import ShareWidget from "metabase/public/components/widgets/ShareWidget";

import { createPublicLink, deletePublicLink } from "../actions";

const mapDispatchToProps = {
    createPublicLink,
    deletePublicLink
}

@connect(null, mapDispatchToProps)
export default class QuestionShareWidget extends Component {
    render() {
        const { className, card, createPublicLink, deletePublicLink, ...props } = this.props;
        return (
            <ShareWidget
                {...props}
                className={className}
                type="question"
                uuid={card.public_uuid}
                extensions={["csv", "json"]}
                onCreate={() => createPublicLink(card)}
                onDisable={() => deletePublicLink(card)}
            />
        );
    }
}
