import { useCallback, useEffect, useState } from "react";
import { useMount } from "react-use";

import { embedApi, publicApi } from "metabase/api";
import { runRtkEndpoint } from "metabase/api/utils/run-rtk-endpoint";
import { applyParameters } from "metabase/common/utils/card";
import { fetchDataOrError } from "metabase/dashboard/utils";
import { LocaleProvider } from "metabase/embedding/LocaleProvider";
import { EmbeddingEntityContextProvider } from "metabase/embedding/context";
import {
  paramFieldsFetched,
  selectQuestionFromCard,
  useQuestionFromCard,
} from "metabase/metadata-store";
import { getParameterValuesByIdFromQueryParams } from "metabase/parameters/utils/parameter-parsing";
import { useEmbedFrameOptions } from "metabase/public/hooks";
import { usePublicEndpoints } from "metabase/public/hooks/use-public-endpoints";
import { useSetEmbedFont } from "metabase/public/hooks/use-set-embed-font";
import { makePivotAwareQueryRunner } from "metabase/querying/api/query-endpoints";
import { useDispatch, useSelector, useStore } from "metabase/redux";
import { setErrorPage } from "metabase/redux/app";
import { useLocation, useParams } from "metabase/router";
import { getCanWhitelabel } from "metabase/selectors/whitelabel";
import { parseSearchQuery } from "metabase/utils/browser";
import { getParameterValuesBySlug } from "metabase-lib/v1/parameters/utils/parameter-values";
import type {
  Card,
  Dataset,
  ParameterId,
  ParameterValuesMap,
} from "metabase-types/api";
import type { EntityToken } from "metabase-types/api/entity";

import { PublicOrEmbeddedQuestionView } from "../PublicOrEmbeddedQuestionView";

export const PublicOrEmbeddedQuestion = () => {
  const location = useLocation();
  const { uuid, token } = useParams<{ uuid: string; token: EntityToken }>();

  const dispatch = useDispatch();
  const store = useStore();
  const buildQuestion = useQuestionFromCard();

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
        await dispatch(paramFieldsFetched(card.param_fields));
      }

      const parameters = selectQuestionFromCard(
        store.getState(),
        card,
      ).parameters();
      const parameterValuesById = getParameterValuesByIdFromQueryParams(
        parameters,
        parseSearchQuery(location.search),
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

    // Both endpoints return the parameters with the template tags folded in,
    // and blank the query, so there are no template tags left to derive.
    const parameters = card.parameters ?? [];
    const question = selectQuestionFromCard(store.getState(), card);

    try {
      setResult(null);

      const runQuery = makePivotAwareQueryRunner(dispatch);

      let resultPromise: Promise<Dataset>;
      if (token) {
        // embeds apply parameter values server-side
        resultPromise = runQuery(
          embedApi.endpoints.getEmbedCardQuery,
          question,
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
          question,
          {
            uuid,
            parameters: JSON.stringify(datasetQuery.parameters),
          },
        );
      } else {
        throw { status: 404 };
      }

      // Unjustified type cast. FIXME
      const newResult = (await fetchDataOrError(resultPromise)) as
        | Dataset
        | { error: unknown };

      // If error is object it is because it was a non-query error
      if (typeof newResult.error === "object") {
        dispatch(setErrorPage(newResult.error));
      } else {
        // Unjustified type cast. FIXME
        setResult(newResult as Dataset);
      }
    } catch (error) {
      console.error("error", error);
      dispatch(setErrorPage(error));
    }
  }, [card, store, dispatch, parameterValues, token, uuid]);

  useEffect(() => {
    run();
  }, [run]);

  const getParameters = () => {
    if (!initialized || !card) {
      return [];
    }

    return buildQuestion(card).parameters();
  };

  return (
    <LocaleProvider
      locale={canWhitelabel ? locale : undefined}
      shouldWaitForLocale
    >
      <EmbeddingEntityContextProvider uuid={uuid ?? null} token={token ?? null}>
        <PublicOrEmbeddedQuestionView
          initialized={initialized}
          card={card}
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
