"use strict";

import ScalarCard from "./cards/ScalarCard.react";
import TableCard from "./cards/TableCard.react";
import ChartCard from "./cards/ChartCard.react";

import LoadingSpinner from "metabase/components/LoadingSpinner.react";

import { fetchDashCardData } from "../actions";

class DashCard extends React.Component {

    componentDidMount() {
        this.props.dispatch(fetchDashCardData(this.props.dashcard.id));
    }

    renderCard() {
        let { card, dataset, error } = this.props.dashcard;
        let data = dataset && dataset.data;

        if (error) {
            return <div>{error}</div>;
        }

        if (card && data) {
            switch (card.display) {
                case "table":  return <TableCard  className="flex-full" card={card} data={data} visualizationSettingsApi={this.props.visualizationSettingsApi} />;
                case "scalar": return <ScalarCard className="flex-full" card={card} data={data} visualizationSettingsApi={this.props.visualizationSettingsApi} />;
                default:       return <ChartCard  className="flex-full" card={card} data={data} visualizationSettingsApi={this.props.visualizationSettingsApi} />;
            }
        }

        return (
            <div className="my4 py4 text-brand text-centered">
                <LoadingSpinner />
                <h1 className="text-normal text-grey-2">Loading...</h1>
            </div>
        );
    }

    render() {
        let { card } = this.props.dashcard;
        return (
            <div className="Card bordered rounded flex flex-column">
                <div className="Card-heading my1 px2">
                    <h3 className="text-normal my1">
                        <a className="Card-title link" href={"/card/"+card.id}>{card.name}</a>
                    </h3>
                </div>
                {this.renderCard()}
            </div>
        );
    }
}

DashCard.propTypes = {
    dispatch: React.PropTypes.func.isRequired,
    dashcard: React.PropTypes.object.isRequired,
    visualizationSettingsApi: React.PropTypes.object.isRequired
};

export default DashCard;
