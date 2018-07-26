/* @flow */

import React, { Component } from "react";
import { connect } from "react-redux";

import Visualization from "metabase/visualizations/components/Visualization";
import QueryDownloadWidget from "metabase/query_builder/components/QueryDownloadWidget";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import ExplicitSize from "metabase/components/ExplicitSize";
import EmbedFrame from "../components/EmbedFrame";

import type { Card } from "metabase/meta/types/Card";
import type { Dataset } from "metabase/meta/types/Dataset";
import type { ParameterValues } from "metabase/meta/types/Parameter";

import { getParametersBySlug } from "metabase/meta/Parameter";
import {
  getParameters,
  getParametersWithExtras,
  applyParameters,
} from "metabase/meta/Card";

import {
  PublicApi,
  EmbedApi,
  setPublicQuestionEndpoints,
  setEmbedQuestionEndpoints,
} from "metabase/services";

import { setErrorPage } from "metabase/redux/app";
import { addParamValues, addFields } from "metabase/redux/metadata";

import { updateIn } from "icepick";

type Props = {
  params: { uuid?: string, token?: string },
  location: { query: { [key: string]: string } },
  width: number,
  height: number,
  setErrorPage: (error: { status: number }) => void,
  addParamValues: any => void,
  addFields: any => void,
};

type State = {
  card: ?Card,
  result: ?Dataset,
  parameterValues: ParameterValues,
};

const mapDispatchToProps = {
  setErrorPage,
  addParamValues,
  addFields,
};

@connect(null, mapDispatchToProps)
@ExplicitSize
export default class PublicQuestion extends Component {
  props: Props;
  state: State;

  constructor(props: Props) {
    super(props);
    this.state = {
      card: null,
      result: null,
      parameterValues: {},
    };
  }

  // $FlowFixMe
  async componentWillMount() {
    const {
      setErrorPage,
      params: { uuid, token },
      location: { query },
    } = this.props;

    if (uuid) {
      setPublicQuestionEndpoints(uuid);
    } else if (token) {
      setEmbedQuestionEndpoints(token);
    }

    try {
      let card;
      if (token) {
        card = await EmbedApi.card({ token });
      } else if (uuid) {
        card = await PublicApi.card({ uuid });
      } else {
        throw { status: 404 };
      }

      if (card.param_values) {
        this.props.addParamValues(card.param_values);
      }
      if (card.param_fields) {
        this.props.addFields(card.param_fields);
      }

      let parameterValues: ParameterValues = {};
      for (let parameter of getParameters(card)) {
        parameterValues[String(parameter.id)] = query[parameter.slug];
      }

      this.setState({ card, parameterValues }, this.run);
    } catch (error) {
      console.error("error", error);
      setErrorPage(error);
    }
  }

  setParameterValue = (id: string, value: string) => {
    this.setState(
      {
        parameterValues: {
          ...this.state.parameterValues,
          [id]: value,
        },
      },
      this.run,
    );
  };

  // $FlowFixMe: setState expects return type void
  run = async (): void => {
    const { setErrorPage, params: { uuid, token } } = this.props;
    const { card, parameterValues } = this.state;

    if (!card) {
      return;
    }

    const parameters = getParameters(card);

    try {
      let newResult;
      if (token) {
        // embeds apply parameter values server-side
        newResult = await EmbedApi.cardQuery({
          token,
          ...getParametersBySlug(parameters, parameterValues),
        });
      } else if (uuid) {
        // public links currently apply parameters client-side
        const datasetQuery = applyParameters(card, parameters, parameterValues);
        newResult = await PublicApi.cardQuery({
          uuid,
          parameters: JSON.stringify(datasetQuery.parameters),
        });
      } else {
        throw { status: 404 };
      }

      this.setState({ result: newResult });
    } catch (error) {
      console.error("error", error);
      setErrorPage(error);
    }
  };

  render() {
    const { params: { uuid, token } } = this.props;
    const { card, result, parameterValues } = this.state;

    const actionButtons = result && (
      <QueryDownloadWidget
        className="m1 text-medium-hover"
        uuid={uuid}
        token={token}
        result={result}
      />
    );

    return (
      <EmbedFrame
        name={card && card.name}
        description={card && card.description}
        parameters={card && getParametersWithExtras(card)}
        actionButtons={actionButtons}
        parameterValues={parameterValues}
        setParameterValue={this.setParameterValue}
      >
        <LoadingAndErrorWrapper loading={!result} className="flex flex-full">
          {() => (
            <Visualization
              rawSeries={[{ card: card, data: result && result.data }]}
              className="full flex-full"
              onUpdateVisualizationSettings={settings =>
                this.setState({
                  // $FlowFixMe
                  result: updateIn(
                    result,
                    ["card", "visualization_settings"],
                    s => ({ ...s, ...settings }),
                  ),
                })
              }
              gridUnit={12}
              showTitle={false}
              isDashboard
            />
          )}
        </LoadingAndErrorWrapper>
      </EmbedFrame>
    );
  }
}
