"use strict";

import ScalarCard from "./cards/ScalarCard.react";
import TableCard from "./cards/TableCard.react";
import ChartCard from "./cards/ChartCard.react";

import LoadingSpinner from "metabase/components/LoadingSpinner.react";

class DashCard extends React.Component {
    renderCard() {
        if (this.props.error) {
            return <div>{this.props.error}</div>;
        }
        if (this.props.card && this.props.data) {
            switch (this.props.card.display) {
                case "table":  return <TableCard  className="flex-full" card={this.props.card} data={this.props.data} visualizationSettingsApi={this.props.visualizationSettingsApi} />;
                case "scalar": return <ScalarCard className="flex-full" card={this.props.card} data={this.props.data} visualizationSettingsApi={this.props.visualizationSettingsApi} />;
                default:       return <ChartCard  className="flex-full" card={this.props.card} data={this.props.data} visualizationSettingsApi={this.props.visualizationSettingsApi} />;
            }
        } else {
            return (
                <div className="my4 py4 text-brand text-centered">
                    <LoadingSpinner />
                    <h1 className="text-normal text-grey-2">Loading...</h1>
                </div>
            );
        }
    }

    render() {
        return (
            <div className="Card bordered rounded flex flex-column">
                <div className="Card-heading my1 px2">
                    <h3 className="text-normal my1">
                        <a className="Card-title link" href={"/card/"+this.props.card.id}>{this.props.card.name}</a>
                    </h3>
                </div>
                {this.renderCard()}
            </div>
        );
    }
}

DashCard.propTypes = {
    card: React.PropTypes.object.isRequired,
    data: React.PropTypes.object,
    visualizationSettingsApi: React.PropTypes.object.isRequired
};

export default DashCard;
