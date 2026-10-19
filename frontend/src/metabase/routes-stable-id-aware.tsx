import { useEffect, useMemo, useState } from "react";
import { match } from "ts-pattern";
import _ from "underscore";

import { NotFound } from "metabase/common/components/ErrorPages";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "metabase/router";
import { parseHashOptions, stringifyHashOptions } from "metabase/utils/browser";
import { isBaseEntityID } from "metabase-types/api/entity-id";

import {
  type TranslateEntityIdResponse,
  useTranslateEntityIdQuery,
} from "./api/entity-id";
type ResourceType =
  | "dashboard"
  | "collection"
  | "card"
  | "dashboard-tab"
  | "dashboard-card";
type ParamType = "param" | "search" | "hash";

type ParamConfig = {
  name: string;
  type: ParamType;
  resourceType: ResourceType;
};

type ParamWithValue = {
  value: string | undefined;
  name: string;
  type: ParamType;
  resourceType: ResourceType;
};

export type EntityIdRedirectProps = {
  parametersToTranslate: ParamConfig[];
};

export const EntityIdRedirect = ({
  parametersToTranslate = [],
}: EntityIdRedirectProps) => {
  const navigate = useNavigate();
  const params = useParams();
  const { pathname, search, hash } = useLocation();
  const [searchParams] = useSearchParams();
  const hashParams = useMemo(
    () => new URLSearchParams(hash.replace(/^#/, "")),
    [hash],
  );

  const paramsWithValues: ParamWithValue[] = useMemo(() => {
    // add the value from the params, the query or the hash
    return parametersToTranslate.map((config) => {
      const value = match(config.type)
        .with("param", () => params[config.name])
        .with("search", () => searchParams.get(config.name) ?? undefined)
        .with("hash", () => hashParams.get(config.name) ?? undefined)
        .exhaustive();
      return {
        ...config,
        value,
      };
    });
  }, [parametersToTranslate, params, searchParams, hashParams]);

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
        pathname,
        search,
        hash,
        paramsWithValues,
        entity_ids,
      });

      if (notFound) {
        setStatus("not-found");
        return;
      }

      if (shouldRedirect) {
        navigate(url.replace("/entity/", "/"));
      }
    }
  }, [
    pathname,
    search,
    hash,
    entity_ids,
    isError,
    isLoading,
    paramsWithValues,
    navigate,
  ]);

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
  pathname,
  search,
  hash,
  paramsWithValues,
  entity_ids,
}: {
  pathname: string;
  search: string;
  hash: string;
  paramsWithValues: ParamWithValue[];
  entity_ids: TranslateEntityIdResponse | undefined;
}) {
  let shouldRedirect = false;
  let notFound = false;
  let nextPathname = pathname;
  let nextSearch = search;
  let hashOptions = parseHashOptions(hash);
  let isHashChanged = false;

  for (const { name, type, value } of paramsWithValues) {
    if (!isBaseEntityID(value)) {
      continue;
    }
    const id = entity_ids?.[value]?.id;

    if (type === "hash") {
      // the hash only points inside the page, so an unknown entity id is
      // dropped instead of showing a 404 for the whole page
      hashOptions = id
        ? { ...hashOptions, [name]: String(id) }
        : _.omit(hashOptions, name);
      isHashChanged = true;
    } else if (!id) {
      notFound = true;
    } else if (type === "param") {
      shouldRedirect = true;
      nextPathname = nextPathname.replace(value, String(id));
    } else {
      shouldRedirect = true;
      nextSearch = nextSearch.replace(value, String(id));
    }
  }

  let nextHash = hash;
  if (isHashChanged) {
    const hashString = stringifyHashOptions(hashOptions);
    nextHash = hashString ? `#${hashString}` : "";
  }

  return {
    shouldRedirect,
    url: nextPathname + nextSearch + nextHash,
    notFound,
  };
}

export function createEntityIdRedirect(config: {
  parametersToTranslate: ParamConfig[];
}) {
  return (
    <EntityIdRedirect parametersToTranslate={config.parametersToTranslate} />
  );
}
