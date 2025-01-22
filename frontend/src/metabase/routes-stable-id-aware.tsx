import { skipToken } from "@reduxjs/toolkit/query";
import type React from "react";
import {
  type PropsWithChildren,
  cloneElement,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { RouteProps, WithRouterProps } from "react-router";

import { Route } from "metabase/hoc/Title";
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

export type EntityIdRedirectProps = //WithRouterProps &
  PropsWithChildren & {
    paramsToTranslate?: ParamConfigMap;
    searchParamsToTranslate?: ParamConfigMap;
    redirect: (path: string) => void;
    location: Pick<
      WithRouterProps["location"],
      "pathname" | "search" | "query"
    >;
    params: WithRouterProps["params"];
  };

export const EntityIdRedirect = ({
  paramsToTranslate = {},
  searchParamsToTranslate = {},
  redirect,
  params,
  location,
  children,
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

  const needsTranslation = Object.keys(entityIdsToTranslate).length > 0;

  const [status, setStatus] = useState<
    "not-found" | "pass-through" | "loading"
  >(needsTranslation ? "loading" : "pass-through");

  const {
    data: entity_ids,
    isError,
    isLoading,
    error,
  } = useTranslateEntityIdQuery(
    needsTranslation ? entityIdsToTranslate : skipToken,
  );

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
        setStatus("pass-through");
        redirect(url);
        return;
      }

      setStatus("pass-through");
    }

    // redux toolkit query doesn't have a "onSuccess" hook,
    if (isError || (!isLoading && needsTranslation)) {
      handleResults();
    }
  }, [
    currentUrl,
    entity_ids,
    isError,
    isLoading,
    needsTranslation,
    paramsWithValues,
    redirect,
  ]);

  if (status === "pass-through") {
    return children;
  }

  if (status === "loading") {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  if (!entity_ids) {
    throw new Error("Error translating entity IDs");
  }

  if (status === "not-found") {
    return <NotFound />;
  }
};

interface EntityIdAwareRouteProps extends RouteProps {
  paramsToTranslate?: ParamConfigMap;
  searchParamsToTranslate?: ParamConfigMap;
}

class _EntityIdAwareRoute extends Route {
  static createRouteFromReactElement(
    element: React.ReactElement<EntityIdAwareRouteProps>,
  ) {
    const {
      component: OriginalComponent = props => <>{props.children}</>,
      ...props
    } = element.props;

    const WrappedComponent = (routeProps: WithRouterProps) => (
      <EntityIdRedirect
        {...props}
        redirect={routeProps.router.push}
        location={routeProps.location}
        params={routeProps.params}
      >
        {OriginalComponent && <OriginalComponent {...routeProps} />}
      </EntityIdRedirect>
    );

    return super.createRouteFromReactElement(
      cloneElement(element, {
        component: WrappedComponent,
      }),
    );
  }
}

export const EntityIdAwareRoute =
  _EntityIdAwareRoute as unknown as React.ComponentType<EntityIdAwareRouteProps>;

export const canBeEntityId = (id: string): id is BaseEntityId => {
  return isBaseEntityID(id);
};

export const canBeNormalId = (id: string) => {
  const parts = id.split("-");

  return !isNaN(parseInt(parts[0]));
};
