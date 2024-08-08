/* eslint-disable react/prop-types */

import cx from "classnames";
import { updateIn } from "icepick";
import { Component } from "react";
import { connect } from "react-redux";
import _ from "underscore";

import ExplicitSize from "metabase/components/ExplicitSize";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import CS from "metabase/css/core/index.css";
import title from "metabase/hoc/Title";
import { getParameterValuesByIdFromQueryParams } from "metabase/parameters/utils/parameter-values";
import QueryDownloadWidget from "metabase/query_builder/components/QueryDownloadWidget";
import { setErrorPage } from "metabase/redux/app";
import { addParamValues, addFields } from "metabase/redux/metadata";
import { getMetadata } from "metabase/selectors/metadata";
import {
  PublicApi,
  EmbedApi,
  setPublicQuestionEndpoints,
  setEmbedQuestionEndpoints,
  maybeUsePivotEndpoint,
} from "metabase/services";
import { PublicMode } from "metabase/visualizations/click-actions/modes/PublicMode";
import Visualization from "metabase/visualizations/components/Visualization";
import Question from "metabase-lib/v1/Question";
import { getCardUiParameters } from "metabase-lib/v1/parameters/utils/cards";
import { getParameterValuesBySlug } from "metabase-lib/v1/parameters/utils/parameter-values";
import { getParametersFromCard } from "metabase-lib/v1/parameters/utils/template-tags";
import { applyParameters } from "metabase-lib/v1/queries/utils/card";

import EmbedFrame from "../../components/EmbedFrame";

const mapStateToProps = state => ({
  metadata: getMetadata(state),
});

const mapDispatchToProps = {
  setErrorPage,
  addParamValues,
  addFields,
};

class PublicOrEmbeddedQuestionInner extends Component {
  constructor(props) {
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
        await this.props.addParamValues(card.param_values);
      }
      if (card.param_fields) {
        await this.props.addFields(card.param_fields);
      }

      const parameters = getCardUiParameters(
        card,
        this.props.metadata,
        {},
        card.parameters || undefined,
      );
      const parameterValuesById = getParameterValuesByIdFromQueryParams(
        parameters,
        query,
      );

      this.setState(
        { card, parameterValues: parameterValuesById },
        async () => {
          await this.run();
          this.setState({ initialized: true });
        },
      );
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

  setParameterValueToDefault = parameterId => {
    const parameters = this.getParameters();
    const parameter = parameters.find(({ id }) => id === parameterId);
    if (parameter) {
      this.setParameterValue(parameterId, parameter.default);
    }
  };

  run = async () => {
    const {
      setErrorPage,
      params: { uuid, token },
    } = this.props;
    const { card, parameterValues } = this.state;

    if (!card) {
      return;
    }

    const parameters = card.parameters || getParametersFromCard(card);

    try {
      this.setState({ result: null });

      let newResult;
      if (token) {
        // embeds apply parameter values server-side
        newResult = await maybeUsePivotEndpoint(
          EmbedApi.cardQuery,
          card,
        )({
          token,
          parameters: JSON.stringify(
            getParameterValuesBySlug(parameters, parameterValues),
          ),
        });
      } else if (uuid) {
        // public links currently apply parameters client-side
        const datasetQuery = applyParameters(card, parameters, parameterValues);
        newResult = await maybeUsePivotEndpoint(
          PublicApi.cardQuery,
          card,
        )({
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

  getParameters() {
    const { metadata } = this.props;
    const { card, initialized } = this.state;

    if (!initialized || !card) {
      return [];
    }

    return getCardUiParameters(
      card,
      metadata,
      {},
      card.parameters || undefined,
    );
  }

  render() {
    const {
      params: { uuid, token },
      metadata,
    } = this.props;
    const { card, result, initialized, parameterValues } = this.state;
    const question = new Question(card, metadata);

    const actionButtons = result && (
      <QueryDownloadWidget
        className={cx(CS.m1, CS.textMediumHover)}
        question={question}
        result={result}
        uuid={uuid}
        token={token}
      />
    );

    return (
      <EmbedFrame
        name={card && card.name}
        description={card && card.description}
        actionButtons={actionButtons}
        question={question}
        parameters={this.getParameters()}
        parameterValues={parameterValues}
        setParameterValue={this.setParameterValue}
        enableParameterRequiredBehavior
        setParameterValueToDefault={this.setParameterValueToDefault}
      >
        <LoadingAndErrorWrapper
          className={CS.flexFull}
          loading={!result || !initialized}
          error={typeof result === "string" ? result : null}
          noWrapper
        >
          {() => (
            <Visualization
              error={result && result.error}
              rawSeries={[{ card: card, data: result && result.data }]}
              className={cx(CS.full, CS.flexFull, CS.z1)}
              onUpdateVisualizationSettings={settings =>
                this.setState({
                  card: updateIn(
                    card,
                    ["visualization_settings"],
                    previousSettings => ({ ...previousSettings, ...settings }),
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

export const PublicOrEmbeddedQuestion = _.compose(
  connect(mapStateToProps, mapDispatchToProps),
  title(({ card }) => card && card.name),
  ExplicitSize({ refreshMode: "debounceLeading" }),
)(PublicOrEmbeddedQuestionInner);
