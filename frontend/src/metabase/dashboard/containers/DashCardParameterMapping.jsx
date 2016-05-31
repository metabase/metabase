import React, { Component, PropTypes } from "react";
import { connect } from "react-redux";

import { loadDatabase } from "metabase/redux/metadata";

const mapStateToProps = (state, props) => ({

});

const mapDispatchToProps = {
    loadDatabase
};

@connect(mapStateToProps, mapDispatchToProps)
export default class DashCardParameterMapping extends Component {
    constructor(props, context) {
        super(props, context);
        this.state = {};
    }

    static propTypes = {
        dashcard: PropTypes.object.isRequired,
    };
    static defaultProps = {};

    componentDidMount() {
        const cards = this.getCards();
        cards.map(card => this.props.loadDatabase(card.dataset_query.database));
    }

    getCards() {
        const { dashcard } = this.props;
        return [dashcard.card].concat(dashcard.series || []);
    }

    render() {
        const cards = this.getCards();
        console.log("cards", cards);
        return (
            <div className="flex-full flex layout-centered">
                {cards.map(card =>
                    <select className="m1">
                        <option></option>
                    </select>
                )}
            </div>
        );
    }
}
