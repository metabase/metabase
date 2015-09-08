'use strict';

import React, { Component } from 'react'

import { CardRenderer } from '../card/card.charting';

export default class QueryVisualizationChart extends Component {
    constructor() {
        super()
        this.state = {}
    }
    componentDidMount() { this.renderChart() }

    componentDidUpdate() { this.renderChart() }

    renderChart() {
        if (this.props.data) {
            try {
                // always ensure we have the most recent visualization settings to use for rendering
                var vizSettings = this.props.visualizationSettingsApi.getSettingsForVisualization(this.props.card.visualization_settings, this.props.card.display);

                // be as immutable as possible and build a card like structure used for charting
                var cardIsh = {
                    name: this.props.card.name,
                    display: this.props.card.display,
                    visualization_settings: vizSettings
                };

                if (this.props.card.display === "pin_map") {
                    cardIsh.visualization_settings = this.props.visualizationSettingsApi.setLatitudeAndLongitude(cardIsh.visualization_settings, this.props.data.cols);
                    return (<CardRenderer type={this.props.card.display} data={this.props.data} />)
                } else {
                    return (
                        <CardRenderer
                            type={this.props.card.display}
                            data={this.props.data}
                            width={this.props.width}
                            height={this.props.height}
                        />
                    )
                }
            } catch (err) {
                console.log('err', err)
            }
        }
    }

    render() {
        return (
            <div className={"Card--" + this.props.card.display + " Card-outer px1"}>
                { this.renderChart() }
            </div>
        );
    }
}
