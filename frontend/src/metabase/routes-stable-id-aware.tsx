import { useEffect, useMemo, useState } from "react";
import type { WithRouterProps } from "react-router";

import {
  type BaseEntityId,
  isBaseEntityID,
} from "metabase-types/api/entity-id";

import { useTranslateEntityIdQuery } from "./api/entity-id";
import { NotFound } from "./components/ErrorPages";
import LoadingAndErrorWrapper from "./components/LoadingAndErrorWrapper";

type ResourceType = "dashboard" | "collection" | "card" | "dashboard-tab";
type ParamConfig = {
  type: ResourceType;
  /** A required parameter that is not found will cause the component to render an error, a non-required parameter that is not found will be removed from the url */
  required: boolean;
};

type FlatParam = {
  param: string;
  value: string;
  type: ResourceType;
  required: boolean;
};

type ParamConfigMap = Record<string, ParamConfig>;

export type EntityIdRedirectProps = {
  paramsToTranslate?: ParamConfigMap;
  searchParamsToTranslate?: ParamConfigMap;
  redirect: (path: string) => void;
  location: Pick<WithRouterProps["location"], "pathname" | "search" | "query">;
  params: WithRouterProps["params"];
};

export const EntityIdRedirect = ({
  paramsToTranslate = {},
  searchParamsToTranslate = {},
  redirect,
  params,
  location,
}: EntityIdRedirectProps) => {
  const currentUrl = location.pathname + location.search;

  const paramsWithValues: FlatParam[] = useMemo(() => {
    const paramsWithValue = Object.entries(paramsToTranslate).map(
      ([param, config]) => ({
        param,
        value: params[param],
        ...config,
      }),
    );
    const searchParamWithValue = Object.entries(searchParamsToTranslate).map(
      ([param, config]) => ({
        param,
        value: location.query[param],
        ...config,
      }),
    );
    return paramsWithValue.concat(searchParamWithValue);
  }, [paramsToTranslate, searchParamsToTranslate, params, location.query]);

  const entityIdsToTranslate = useMemo(() => {
    const map: Record<string, string[]> = {};
    paramsWithValues.forEach(({ value, type }) => {
      if (isBaseEntityID(value)) {
        map[type] = map[type] || [];
        map[type].push(value);
      }
    });
    return map;
  }, [paramsWithValues]);

  const [status, setStatus] = useState<"not-found" | "loading">("loading");

  const {
    data: entity_ids,
    isError,
    isLoading,
    error,
  } = useTranslateEntityIdQuery(entityIdsToTranslate);

  useEffect(() => {
    function handleResults() {
      let shouldRedirect = false;
      let url = currentUrl;
      let notFound = false;
      for (const { value, required } of paramsWithValues) {
        if (isBaseEntityID(value)) {
          const mappedEntityId = entity_ids?.[value];
          // if the entity id is found, we replace it with the numeric id
          if (mappedEntityId?.id) {
            shouldRedirect = true;
            url = url.replace(value, String(mappedEntityId.id));
          } else {
            if (!canBeNormalId(value)) {
              if (required) {
                // if it's found and cannot be a normal slug (ie: it starts with a letter)
                // then we show an error
                notFound = true;
              }
            } else {
              // if it's not required and it can't be a normal slug, then we remove it from the url
              url = url.replace(value, "");
            }
          }
        }
      }

      if (notFound) {
        setStatus("not-found");
        return;
      }

      if (shouldRedirect) {
        const newUrl = url.replace("by-entity-id/", "");
        redirect(newUrl);
      }
    }

    if (!isLoading) {
      handleResults();
    }
  }, [currentUrl, entity_ids, isError, isLoading, paramsWithValues, redirect]);

  if (isError) {
    throw error;
  }

  if (status === "loading") {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  if (status === "not-found" || !entity_ids) {
    return <NotFound />;
  }
};

export function createEntityIdRedirect(config: {
  paramsToTranslate?: ParamConfigMap;
  searchParamsToTranslate?: ParamConfigMap;
}) {
  const Component = (props: WithRouterProps) => (
    <EntityIdRedirect
      paramsToTranslate={config.paramsToTranslate}
      searchParamsToTranslate={config.searchParamsToTranslate}
      redirect={props.router.push}
      location={props.location}
      params={props.params}
    />
  );

  return Component;
}

export const canBeEntityId = (id: string): id is BaseEntityId => {
  return isBaseEntityID(id);
};

export const canBeNormalId = (id: string) => {
  const parts = id.split("-");
  return !isNaN(parseInt(parts[0]));
};
