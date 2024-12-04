import type { Location } from "history";
import { useCallback, useEffect, useState } from "react";
import { useMount } from "react-use";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { LocaleProvider } from "metabase/public/LocaleProvider";
import { useEmbedFrameOptions } from "metabase/public/hooks";
import { setErrorPage } from "metabase/redux/app";
import { addFields, addParamValues } from "metabase/redux/metadata";
import { getMetadata } from "metabase/selectors/metadata";
import { getCanWhitelabel } from "metabase/selectors/whitelabel";
import {
  EmbedApi,
  PublicApi,
  maybeUsePivotEndpoint,
  setEmbedQuestionEndpoints,
  setPublicQuestionEndpoints,
} from "metabase/services";
import { getCardUiParameters } from "metabase-lib/v1/parameters/utils/cards";
import { getParameterValuesByIdFromQueryParams } from "metabase-lib/v1/parameters/utils/parameter-parsing";
import { getParameterValuesBySlug } from "metabase-lib/v1/parameters/utils/parameter-values";
import { getParametersFromCard } from "metabase-lib/v1/parameters/utils/template-tags";
import { applyParameters } from "metabase-lib/v1/queries/utils/card";
import type {
  Card,
  Dataset,
  ParameterId,
  ParameterValuesMap,
} from "metabase-types/api";

import { PublicOrEmbeddedQuestionView } from "../PublicOrEmbeddedQuestionView";

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
  const { bordered, hide_parameters, theme, titled, downloadsEnabled, locale } =
    useEmbedFrameOptions({ location });

  const canWhitelabel = useSelector(getCanWhitelabel);

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

  return (
    <LocaleProvider locale={canWhitelabel ? locale : undefined}>
      <PublicOrEmbeddedQuestionView
        initialized={initialized}
        card={card}
        metadata={metadata}
        result={result}
        uuid={uuid}
        token={token}
        getParameters={getParameters}
        parameterValues={parameterValues}
        setParameterValue={setParameterValue}
        setParameterValueToDefault={setParameterValueToDefault}
        bordered={bordered}
        hide_parameters={hide_parameters}
        theme={theme}
        titled={titled}
        setCard={setCard}
        downloadsEnabled={downloadsEnabled}
      />
    </LocaleProvider>
  );
};
