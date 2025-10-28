import {
  type ComponentType,
  useCallback,
  useLayoutEffect,
  useState,
} from "react";
import { routerActions } from "react-router-redux";
import { connectedReduxRedirect } from "redux-auth-wrapper/history3/redirect";
import _ from "underscore";

import { MetabaseReduxContext } from "metabase/lib/redux";
import type { State } from "metabase-types/store";

/**
 * react-resizable-panels sizes are in percentages,
 * but we want to be able to specify some sizes in fixed pixel terms
 */
export const useAbsoluteSize = ({ groupId }: { groupId: string }) => {
  const [width, setWidth] = useState(1200);

  useLayoutEffect(() => {
    const panelGroup = document.querySelector(
      `[data-panel-group-id="${groupId}"]`,
    ) as HTMLElement | null;
    if (!panelGroup) {
      return;
    }

    const debouncedSetWidth = _.debounce(setWidth, 250);

    const observer = new ResizeObserver(() => {
      const { width } = panelGroup.getBoundingClientRect();
      debouncedSetWidth(width);
    });

    observer.observe(panelGroup);

    return () => {
      observer.disconnect();
    };
  }, [groupId]);

  const getSizeFn = useCallback((px: number) => (px / width) * 100, [width]);

  return getSizeFn;
};

export const createBenchAdminRouteGuard = (
  routeKey: string,
  Component?: ComponentType<any>,
) => {
  const Wrapper = connectedReduxRedirect({
    wrapperDisplayName: `CanAccess(${routeKey})`,
    redirectPath: "/bench/unauthorized",
    allowRedirectBack: false,
    authenticatedSelector: (state: State) =>
      Boolean(state.currentUser && state.currentUser.is_superuser),
    redirectAction: routerActions.replace,
    context: MetabaseReduxContext,
  });

  // @ts-expect-error -- not typed properly
  return Wrapper(Component ?? (({ children }) => children));
};
