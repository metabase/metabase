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
};

type ParamWithValue = {
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
  for (const { value } of paramsWithValues) {
    if (isBaseEntityID(value)) {
      const mappedEntityId = entity_ids?.[value];
      // if the entity id is found, we replace it with the numeric id
      if (mappedEntityId?.id) {
        shouldRedirect = true;
        url = url.replace(value, String(mappedEntityId.id));
      } else {
        // if it's not found we show a 404
        notFound = true;
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
