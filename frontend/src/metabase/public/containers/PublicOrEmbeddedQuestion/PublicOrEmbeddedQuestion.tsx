import cx from "classnames";
import type { Location } from "history";
import { updateIn } from "icepick";
import { useCallback, useEffect, useState } from "react";
import { useMount } from "react-use";
import _ from "underscore";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import CS from "metabase/css/core/index.css";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { getParameterValuesByIdFromQueryParams } from "metabase/parameters/utils/parameter-values";
import { EmbedFrame } from "metabase/public/components/EmbedFrame";
import { useEmbedFrameOptions } from "metabase/public/hooks";
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
import type {
  Card,
  VisualizationSettings,
  Dataset,
  ParameterId,
  ParameterValuesMap,
} from "metabase-types/api";

export const PublicOrEmbeddedQuestion = ({
  params: { uuid, token },
  location,
}: {
  location: Location;
  params: { uuid: string; token: string };
}) => {
  const dispatch = useDispatch();

  const metadata = useSelector(getMetadata);

  const [initialized, setInitialized] = useState(false);

  const [card, setCard] = useState<Card | null>(null);
  const [result, setResult] = useState<Dataset | null>(null);
  const [parameterValues, setParameterValues] = useState<ParameterValuesMap>(
    {},
  );

  useMount(async () => {
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
        await dispatch(addParamValues(card.param_values));
      }
      if (card.param_fields) {
        await dispatch(addFields(card.param_fields));
      }

      const parameters = getCardUiParameters(
        card,
        metadata,
        {},
        card.parameters || undefined,
      );
      const parameterValuesById = getParameterValuesByIdFromQueryParams(
        parameters,
        location.query,
      );

      setCard(card);
      setParameterValues(parameterValuesById);
      setInitialized(true);
    } catch (error) {
      console.error("error", error);
      dispatch(setErrorPage(error));
    }
  });

  const setParameterValue = async (parameterId: ParameterId, value: any) => {
    setParameterValues(prevParameterValues => ({
      ...prevParameterValues,
      [parameterId]: value,
    }));
  };

  const setParameterValueToDefault = (parameterId: ParameterId) => {
    const parameters = getParameters();
    const parameter = parameters.find(({ id }) => id === parameterId);
    if (parameter) {
      setParameterValue(parameterId, parameter.default);
    }
  };

  const run = useCallback(async () => {
    if (!card) {
      return;
    }

    const parameters = card.parameters || getParametersFromCard(card);

    try {
      setResult(null);

      let newResult;
      if (token) {
        // embeds apply parameter values server-side
        newResult = await maybeUsePivotEndpoint(
          EmbedApi.cardQuery,
          card,
        )({
          token,
          ...getParameterValuesBySlug(parameters, parameterValues),
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

      setResult(newResult);
    } catch (error) {
      console.error("error", error);
      dispatch(setErrorPage(error));
    }
  }, [card, dispatch, parameterValues, token, uuid]);

  useEffect(() => {
    run();
  }, [run]);

  const getParameters = () => {
    if (!initialized || !card) {
      return [];
    }

    return getCardUiParameters(
      card,
      metadata,
      {},
      card.parameters || undefined,
    );
  };

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

  const { bordered, titled, theme, hide_download_button, hide_parameters } =
    useEmbedFrameOptions({ location });

  return (
    <EmbedFrame
      name={card && card.name}
      description={card && card.description}
      actionButtons={actionButtons}
      question={question}
      parameters={getParameters()}
      parameterValues={parameterValues}
      setParameterValue={setParameterValue}
      enableParameterRequiredBehavior
      setParameterValueToDefault={setParameterValueToDefault}
      // Since this isn't configurable, we always set the background to true
      background
      bordered={bordered}
      titled={titled}
      theme={theme}
      hide_download_button={hide_download_button}
      hide_parameters={hide_parameters}
    >
      <LoadingAndErrorWrapper
        className={CS.flexFull}
        loading={!result}
        error={typeof result === "string" ? result : null}
        noWrapper
      >
        {() => (
          <Visualization
            error={result && result.error}
            rawSeries={[{ card: card, data: result && result.data }]}
            className={cx(CS.full, CS.flexFull, CS.z1)}
            onUpdateVisualizationSettings={(
              settings: VisualizationSettings,
            ) => {
              setCard(prevCard =>
                updateIn(
                  prevCard,
                  ["visualization_settings"],
                  previousSettings => ({ ...previousSettings, ...settings }),
                ),
              );
            }}
            gridUnit={12}
            showTitle={false}
            isDashboard
            mode={PublicMode}
            metadata={metadata}
            onChangeCardAndRun={() => {}}
          />
        )}
      </LoadingAndErrorWrapper>
    </EmbedFrame>
  );
};
