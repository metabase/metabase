import { useEffect, useMemo, useState } from "react";
import type { WithRouterProps } from "react-router";
import { match } from "ts-pattern";

import {
  type BaseEntityId,
  isBaseEntityID,
} from "metabase-types/api/entity-id";

import {
  type TranslateEntityIdResponse,
  useTranslateEntityIdQuery,
} from "./api/entity-id";
import { NotFound } from "./components/ErrorPages";
import { LoadingAndErrorWrapper } from "./components/LoadingAndErrorWrapper";
type ResourceType = "dashboard" | "collection" | "card" | "dashboard-tab";
type ParamType = "param" | "search";

type ParamConfig = {
  name: string;
  type: ParamType;
  resourceType: ResourceType;
  required?: boolean;
};

type ParamWithValue = {
  required: boolean;
  value: string;
  name: string;
  type: ParamType;
  resourceType: ResourceType;
};

export type EntityIdRedirectProps = WithRouterProps & {
  parametersToTranslate: ParamConfig[];
};

export const EntityIdRedirect = ({
  parametersToTranslate = [],
  router,
  params,
  location,
}: EntityIdRedirectProps) => {
  const currentUrl = location.pathname + location.search;

  const paramsWithValues: ParamWithValue[] = useMemo(() => {
    // add the value from the params or the query
    return parametersToTranslate.map(config => {
      const value = match(config.type)
        .with("param", () => params[config.name])
        .with("search", () => location.query[config.name])
        .exhaustive();
      return {
        ...config,
        required: config.required ?? true,
        value,
      };
    });
  }, [parametersToTranslate, params, location.query]);

  const entityIdsToTranslate = useMemo(() => {
    // formats the entity ids in the format {resourceType: [entityId1, entityId2]}
    // as needed by the endpoint
    const map: Record<string, string[]> = {};
    paramsWithValues.forEach(({ value, resourceType }) => {
      if (isBaseEntityID(value)) {
        map[resourceType] = map[resourceType] || [];
        map[resourceType].push(value);
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
    if (!isLoading) {
      const { shouldRedirect, url, notFound } = handleResults({
        currentUrl,
        paramsWithValues,
        entity_ids,
      });

      if (notFound) {
        setStatus("not-found");
        return;
      }

      if (shouldRedirect) {
        router.push(url.replace("/entity/", "/"));
      }
    }
  }, [currentUrl, entity_ids, isError, isLoading, paramsWithValues, router]);

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

function handleResults({
  currentUrl,
  paramsWithValues,
  entity_ids,
}: {
  currentUrl: string;
  paramsWithValues: ParamWithValue[];
  entity_ids: TranslateEntityIdResponse | undefined;
}) {
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
      } else if (!canBeNormalId(value)) {
        // if it's found and cannot be a normal slug (ie: it doesn't start with a number)
        if (required) {
          // if it's required, then we show an error, this is needed because at this time some endpoints
          // become stuck in infinite loading if they fail to parse the numeric id from the slug
          notFound = true;
        } else {
          // if it's not required then we remove it from the url
          url = url.replace(value, "");
        }
      }
    }
  }
  return { shouldRedirect, url, notFound };
}

export function createEntityIdRedirect(config: {
  parametersToTranslate: ParamConfig[];
}) {
  const Component = (props: WithRouterProps) => (
    <EntityIdRedirect
      {...props}
      parametersToTranslate={config.parametersToTranslate}
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
