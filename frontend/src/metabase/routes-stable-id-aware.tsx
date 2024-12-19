import { skipToken } from "@reduxjs/toolkit/query";
import type React from "react";
import { type PropsWithChildren, cloneElement, useMemo } from "react";
import type { RouteProps, WithRouterProps } from "react-router";

import { Route } from "metabase/hoc/Title";
import { isBaseEntityID } from "metabase-types/api/entity-id";

import { useTranslateEntityIdQuery } from "./api/entity-id";

type ResourceType = "dashboard" | "collection" | "question" | "dashboard-tab";

const nonEntityIds: Record<string, boolean> = {};

type EntityIdRedirectProps = WithRouterProps &
  PropsWithChildren & {
    paramsToTranslate?: Partial<Record<ResourceType, string>>;
    searchParamsToTranslate?: Partial<Record<ResourceType, string>>;
  };

export const EntityIdRedirect = ({
  paramsToTranslate = {},
  searchParamsToTranslate = {},
  ...props
}: EntityIdRedirectProps) => {
  const entityIdsToTranslate = useMemo(() => {
    const _entityIdsToTranslate: Record<string, string[]> = {};

    for (const [type, param] of Object.entries(paramsToTranslate)) {
      const value = props.params[param];
      if (isBaseEntityID(value) && !nonEntityIds[value]) {
        _entityIdsToTranslate[type] = [value];
      }
    }

    for (const [type, param] of Object.entries(searchParamsToTranslate)) {
      const value = props.location.query[param];
      if (isBaseEntityID(value) && !nonEntityIds[value]) {
        _entityIdsToTranslate[type] = [value];
      }
    }

    return _entityIdsToTranslate;
  }, [
    paramsToTranslate,
    searchParamsToTranslate,
    props.params,
    props.location.query,
  ]);

  const needsTranslation = Object.keys(entityIdsToTranslate).length > 0;

  console.log("[DEBUG]", { needsTranslation, entityIdsToTranslate });

  const {
    data: entity_ids,
    isError,
    isLoading,
  } = useTranslateEntityIdQuery(
    needsTranslation ? entityIdsToTranslate : skipToken,
  );

  if (!needsTranslation) {
    return props.children;
  }

  if (isLoading) {
    // TODO: Add loading state
    return null;
  }

  if (isError) {
    // TODO: Add error state
    return null;
  }

  const currentUrl = props.location.pathname + props.location.search;

  if (!entity_ids || Object.entries(entity_ids).length === 0) {
    throw new Error("Error translating entity IDs");
  }

  console.log("[DEBUG]", { entity_ids });

  const destPath = Object.entries(entity_ids).reduce(
    (acc, [entityId, result]) => {
      if (result.id) {
        return acc.replace(entityId, "" + result.id);
      } else {
        nonEntityIds[entityId] = true;
      }
      return acc;
    },
    currentUrl,
  );

  console.log("[DEBUG] Current URL", currentUrl);

  console.log("[DEBUG] Redirecting to", destPath);
  props.router.push(destPath);

  return null;
};

interface EntityIdAwareRouteProps extends RouteProps {
  paramsToTranslate?: Record<ResourceType, string>;
  searchParamsToTranslate?: Record<ResourceType, string>;
}

class _EntityIdAwareRoute extends Route {
  static createRouteFromReactElement(
    element: React.ReactElement<EntityIdAwareRouteProps>,
  ) {
    console.log("[DEBUG] createRouteFromReactElement", { element });
    const { component: OriginalComponent, ...props } = element.props;

    const WrappedComponent = (routeProps: WithRouterProps) => (
      <EntityIdRedirect {...props} {...routeProps}>
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

/* examples:
http://localhost:3000/dashboard/xBLdW9FsgRuB2HGhWiBa_/move
http://localhost:3000/dashboard/xBLdW9FsgRuB2HGhWiBa_?tab=dJjVk7QtJaNp6panPlnH5
http://localhost:3000/dashboard/xBLdW9FsgRuB2HGhWiBa_?date_grouping=&date_range=&product_category=Doohickey&product_category=Gizmo&product_category=Gadget&product_category=Widget&tab=1-overview&vendor=
*/
