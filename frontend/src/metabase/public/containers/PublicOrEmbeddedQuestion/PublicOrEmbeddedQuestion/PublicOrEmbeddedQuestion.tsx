import type { Location } from "history";
import { useCallback, useEffect, useState } from "react";
import { useLatest, useMount } from "react-use";

import { embedApi, makePivotAwareQueryRunner, publicApi } from "metabase/api";
import { runRtkEndpoint } from "metabase/api/utils/run-rtk-endpoint";
import { applyParameters } from "metabase/common/utils/card";
import { fetchDataOrError } from "metabase/dashboard/utils";
import { LocaleProvider } from "metabase/embedding/LocaleProvider";
import { EmbeddingEntityContextProvider } from "metabase/embedding/context";
import { getParameterValuesByIdFromQueryParams } from "metabase/parameters/utils/parameter-parsing";
import { useEmbedFrameOptions } from "metabase/public/hooks";
import { usePublicEndpoints } from "metabase/public/hooks/use-public-endpoints";
import { useSetEmbedFont } from "metabase/public/hooks/use-set-embed-font";
import { useDispatch, useSelector } from "metabase/redux";
import { setErrorPage } from "metabase/redux/app";
import { updateMetadata } from "metabase/redux/metadata";
import { FieldSchema } from "metabase/schema";
import { getMetadata } from "metabase/selectors/metadata";
import { getCanWhitelabel } from "metabase/selectors/whitelabel";
import { getCardUiParameters } from "metabase-lib/v1/parameters/utils/cards";
import { getParameterValuesBySlug } from "metabase-lib/v1/parameters/utils/parameter-values";
import { getParametersFromCard } from "metabase-lib/v1/parameters/utils/template-tags";
import type {
  Card,
  Dataset,
  ParameterId,
  ParameterValuesMap,
} from "metabase-types/api";
import type { EntityToken } from "metabase-types/api/entity";

import { PublicOrEmbeddedQuestionView } from "../PublicOrEmbeddedQuestionView";

export const PublicOrEmbeddedQuestion = ({
  params: { uuid, token },
  location,
}: {
  location: Location;
  params: { uuid: string; token: EntityToken };
}) => {
  const dispatch = useDispatch();
  const metadata = useSelector(getMetadata);
  // we cannot use `metadata` directly otherwise hooks will re-run on every metadata change
  const metadataRef = useLatest(metadata);

  const [initialized, setInitialized] = useState(false);

  const [card, setCard] = useState<Card | null>(null);
  const [result, setResult] = useState<Dataset | null>(null);
  const [parameterValues, setParameterValues] = useState<ParameterValuesMap>(
    {},
  );

  useSetEmbedFont({ location });

  const { bordered, hide_parameters, theme, titled, downloadsEnabled, locale } =
    useEmbedFrameOptions({ location });

  const canWhitelabel = useSelector(getCanWhitelabel);

  usePublicEndpoints({ uuid, token });

  useMount(async () => {
    try {
      let card;
      if (token) {
        card = await runRtkEndpoint(
          { token },
          dispatch,
          embedApi.endpoints.getEmbedCard,
        );
      } else if (uuid) {
        card = await runRtkEndpoint(
          { uuid },
          dispatch,
          publicApi.endpoints.getPublicCard,
        );
      } else {
        throw { status: 404 };
      }

      if (card.param_fields) {
        await dispatch(
          updateMetadata(Object.values(card.param_fields).flat(), [
            FieldSchema,
          ]),
        );
      }

      const parameters = getCardUiParameters(
        card,
        metadataRef.current,
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
    setParameterValues((prevParameterValues) => ({
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

    const parameters =
      card.parameters || getParametersFromCard(card, metadataRef.current);

    try {
      setResult(null);

      const runQuery = makePivotAwareQueryRunner(dispatch);

      let resultPromise: Promise<Dataset>;
      if (token) {
        // embeds apply parameter values server-side
        resultPromise = runQuery(
          embedApi.endpoints.getEmbedCardQuery,
          card,
          metadataRef.current,
          {
            token,
            parameters: JSON.stringify(
              getParameterValuesBySlug(parameters, parameterValues),
            ),
          },
        );
      } else if (uuid) {
        // public links currently apply parameters client-side
        const datasetQuery = applyParameters(
          card,
          parameters,
          parameterValues,
          [],
          { sparse: true },
        );
        resultPromise = runQuery(
          publicApi.endpoints.getPublicCardQuery,
          card,
          metadataRef.current,
          {
            uuid,
            parameters: JSON.stringify(datasetQuery.parameters),
          },
        );
      } else {
        throw { status: 404 };
      }

      const newResult = (await fetchDataOrError(resultPromise)) as
        | Dataset
        | { error: unknown };

      // If error is object it is because it was a non-query error
      if (typeof newResult.error === "object") {
        dispatch(setErrorPage(newResult.error));
      } else {
        setResult(newResult as Dataset);
      }
    } catch (error) {
      console.error("error", error);
      dispatch(setErrorPage(error));
    }
  }, [card, metadataRef, dispatch, parameterValues, token, uuid]);

  useEffect(() => {
    run();
  }, [run]);

  const getParameters = () => {
    if (!initialized || !card) {
      return [];
    }

    return getCardUiParameters(
      card,
      metadataRef.current,
      {},
      card.parameters || undefined,
    );
  };

  return (
    <LocaleProvider
      locale={canWhitelabel ? locale : undefined}
      shouldWaitForLocale
    >
      <EmbeddingEntityContextProvider uuid={uuid} token={token}>
        <PublicOrEmbeddedQuestionView
          initialized={initialized}
          card={card}
          metadata={metadata}
          result={result}
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
      </EmbeddingEntityContextProvider>
    </LocaleProvider>
  );
};
