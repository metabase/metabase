/* @flow */

import React, { Component, PropTypes } from "react";
import { connect } from "react-redux";

import Visualization from "metabase/visualizations/components/Visualization";
import QueryDownloadWidget from "metabase/query_builder/components/QueryDownloadWidget";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import ExplicitSize from "metabase/components/ExplicitSize";
import EmbedFrame from "../components/EmbedFrame";

import { getParameters, applyParameters } from "metabase/meta/Card";
import type { Card } from "metabase/meta/types/Card";
import type { Dataset } from "metabase/meta/types/Dataset";

import { PublicApi } from "metabase/services";

import { setErrorPage } from "metabase/redux/app";

import { updateIn } from "icepick";

type Props = {
    params:       { uuid: string },
    location:     { query: { [key:string]: string }},
    width:        number,
    height:       number,
    setErrorPage: (error: { status: number }) => void,
};

type State = {
    card:               ?Card,
    result:             ?Dataset,
    parameterValues:    {[key:string]: string}
};

const mapDispatchToProps = {
    setErrorPage
};

@connect(null, mapDispatchToProps)
@ExplicitSize
export default class PublicQuestion extends Component<*, Props, State> {
    props: Props;
    state: State;

    constructor(props: Props) {
        super(props);
        this.state = {
            card: null,
            result: null,
            parameterValues: {}
        }
    }

    // $FlowFixMe
    async componentWillMount() {
        const { setErrorPage, params: { uuid }, location: { query }} = this.props;
        try {
            let card = await PublicApi.card({ uuid });

            let parameters = getParameters(card);
            let parameterValues = {};
            for (let parameter of parameters) {
                parameterValues[parameter.id] = query[parameter.slug];
            }

            this.setState({ card, parameterValues }, this.run);
        } catch (error) {
            setErrorPage(error);
        }
    }

    setParameterValue = (id: string, value: string) => {
        this.setState({
            parameterValues: {
                ...this.state.parameterValues,
                [id]: value
            }
        }, this.run);
    }

    // $FlowFixMe: setState expects return type void
    run = async (): void => {
        const { setErrorPage, params: { uuid } } = this.props;
        const { card, parameterValues } = this.state;

        if (!card) {
            return;
        }

        const parameters = getParameters(card);
        const datasetQuery = applyParameters(card, parameters, parameterValues);

        try {
            const newResult = await PublicApi.cardQuery({
                uuid,
                parameters: JSON.stringify(datasetQuery.parameters)
            });

            this.setState({ result: newResult });
        } catch (error) {
            setErrorPage(error);
        }
    }

    render() {
        const { params: { uuid } } = this.props;
        const { card, result, parameterValues } = this.state;

        const actionButtons = result && (
            <QueryDownloadWidget
                className="m1 text-grey-4-hover"
                uuid={uuid}
                result={result}
            />
        )

        return (
            <EmbedFrame
                className="relative spread"
                name={card && card.name}
                description={card && card.description}
                actionButtons={actionButtons}
                parameters={getParameters(card)}
                parameterValues={parameterValues}
                setParameterValue={this.setParameterValue}
            >
                <LoadingAndErrorWrapper loading={!result}>
                { () =>
                    <Visualization
                        series={[{ card: card, data: result && result.data }]}
                        className="full flex-full"
                        onUpdateVisualizationSettings={(settings) =>
                            this.setState({
                                // $FlowFixMe
                                result: updateIn(result, ["card", "visualization_settings"], (s) => ({ ...s, ...settings }))
                            })
                        }
                        gridUnit={12}
                        linkToCard={false}
                    />
                }
                </LoadingAndErrorWrapper>
            </EmbedFrame>
        )
    }
}
