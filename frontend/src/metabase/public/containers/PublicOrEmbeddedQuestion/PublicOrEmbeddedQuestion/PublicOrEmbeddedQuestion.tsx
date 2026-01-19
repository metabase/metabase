import type { Location } from "history";
import { useCallback, useEffect, useState } from "react";
import { useLatest, useMount } from "react-use";

import { EmbeddingEntityContextProvider } from "metabase/embedding/context";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { LocaleProvider } from "metabase/public/LocaleProvider";
import { useEmbedFrameOptions } from "metabase/public/hooks";
import { usePublicEndpoints } from "metabase/public/hooks/use-public-endpoints";
import { useSetEmbedFont } from "metabase/public/hooks/use-set-embed-font";
import { setErrorPage } from "metabase/redux/app";
import { addFields } from "metabase/redux/metadata";
import { getMetadata } from "metabase/selectors/metadata";
import { getCanWhitelabel } from "metabase/selectors/whitelabel";
import { EmbedApi, PublicApi, maybeUsePivotEndpoint } from "metabase/services";
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
      let card: Card & { param_fields?: Record<string, unknown[]> };
      if (token) {
        card = (await EmbedApi.card({ token })) as Card & {
          param_fields?: Record<string, unknown[]>;
        };
      } else if (uuid) {
        card = (await PublicApi.card({ uuid })) as Card & {
          param_fields?: Record<string, unknown[]>;
        };
      } else {
        throw { status: 404 };
      }

      if (card.param_fields) {
        await dispatch(addFields(Object.values(card.param_fields).flat()));
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

      let newResult;
      if (token) {
        // embeds apply parameter values server-side
        newResult = await maybeUsePivotEndpoint(
          EmbedApi.cardQuery,
          card,
          metadataRef.current,
        )({
          token,
          parameters: JSON.stringify(
            getParameterValuesBySlug(parameters, parameterValues),
          ),
        });
      } else if (uuid) {
        // public links currently apply parameters client-side
        const datasetQuery = applyParameters(
          card,
          parameters,
          parameterValues,
          [],
          { sparse: true },
        );
        newResult = await maybeUsePivotEndpoint(
          PublicApi.cardQuery,
          card,
          metadataRef.current,
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
