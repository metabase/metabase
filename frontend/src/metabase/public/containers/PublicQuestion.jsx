/* eslint-disable react/prop-types */
import React, { Component } from "react";
import { connect } from "react-redux";

import Visualization from "metabase/visualizations/components/Visualization";
import QueryDownloadWidget from "metabase/query_builder/components/QueryDownloadWidget";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import ExplicitSize from "metabase/components/ExplicitSize";
import EmbedFrame from "../components/EmbedFrame";
import title from "metabase/hoc/Title";

import type { Card } from "metabase-types/types/Card";
import type { Dataset } from "metabase-types/types/Dataset";
import type { ParameterValues } from "metabase-types/types/Parameter";

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
  maybeUsePivotEndpoint,
} from "metabase/services";

import { setErrorPage } from "metabase/redux/app";
import { addParamValues, addFields } from "metabase/redux/metadata";
import { getMetadata } from "metabase/selectors/metadata";

import PublicMode from "metabase/modes/components/modes/PublicMode";

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

const mapStateToProps = state => ({
  metadata: getMetadata(state),
});

const mapDispatchToProps = {
  setErrorPage,
  addParamValues,
  addFields,
};

@connect(
  mapStateToProps,
  mapDispatchToProps,
)
@title(({ card }) => card && card.name)
@ExplicitSize()
export default class PublicQuestion extends Component {
  props: Props;
  state: State;

  constructor(props: Props) {
    super(props);
    this.state = {
      card: null,
      result: null,
      initialized: false,
      parameterValues: {},
    };
  }

  async UNSAFE_componentWillMount() {
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

      const parameterValues: ParameterValues = {};
      for (const parameter of getParameters(card)) {
        parameterValues[String(parameter.id)] = query[parameter.slug];
      }

      this.setState({ card, parameterValues }, async () => {
        await this.run();
        this.setState({ initialized: true });
      });
    } catch (error) {
      console.error("error", error);
      setErrorPage(error);
    }
  }

  setParameterValue = (parameterId, value) => {
    this.setState(
      {
        parameterValues: {
          ...this.state.parameterValues,
          [parameterId]: value,
        },
      },
      this.run,
    );
  };

  setMultipleParameterValues = parameterValues => {
    this.setState(
      {
        parameterValues: {
          ...this.state.parameterValues,
          ...parameterValues,
        },
      },
      this.run,
    );
  };

  run = async (): void => {
    const {
      setErrorPage,
      params: { uuid, token },
    } = this.props;
    const { card, parameterValues } = this.state;

    if (!card) {
      return;
    }

    const parameters = getParameters(card);

    try {
      this.setState({ result: null });

      let newResult;
      if (token) {
        // embeds apply parameter values server-side
        newResult = await maybeUsePivotEndpoint(EmbedApi.cardQuery, card)({
          token,
          ...getParametersBySlug(parameters, parameterValues),
        });
      } else if (uuid) {
        // public links currently apply parameters client-side
        const datasetQuery = applyParameters(card, parameters, parameterValues);
        newResult = await maybeUsePivotEndpoint(PublicApi.cardQuery, card)({
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
    const {
      params: { uuid, token },
    } = this.props;
    const { card, result, initialized, parameterValues } = this.state;

    const actionButtons = result && (
      <QueryDownloadWidget
        className="m1 text-medium-hover"
        uuid={uuid}
        token={token}
        result={result}
      />
    );

    const parameters = card && getParametersWithExtras(card);

    return (
      <EmbedFrame
        name={card && card.name}
        description={card && card.description}
        parameters={initialized ? parameters : []}
        actionButtons={actionButtons}
        parameterValues={parameterValues}
        setParameterValue={this.setParameterValue}
        setMultipleParameterValues={this.setMultipleParameterValues}
      >
        <LoadingAndErrorWrapper
          className="flex-full"
          loading={!result || !initialized}
          error={typeof result === "string" ? result : null}
          noWrapper
        >
          {() => (
            <Visualization
              error={result && result.error}
              rawSeries={[{ card: card, data: result && result.data }]}
              className="full flex-full z1"
              onUpdateVisualizationSettings={settings =>
                this.setState({
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
              mode={PublicMode}
              metadata={this.props.metadata}
              onChangeCardAndRun={() => {}}
            />
          )}
        </LoadingAndErrorWrapper>
      </EmbedFrame>
    );
  }
}
