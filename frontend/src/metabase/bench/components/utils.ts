import { useCallback, useLayoutEffect, useState } from "react";
import { routerActions } from "react-router-redux";
import { connectedReduxRedirect } from "redux-auth-wrapper/history3/redirect";
import _ from "underscore";

import { MetabaseReduxContext } from "metabase/lib/redux";

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
  Component?: Function, // eslint-disable-line @typescript-eslint/ban-types
) => {
  const Wrapper = connectedReduxRedirect({
    wrapperDisplayName: `CanAccess(${routeKey})`,
    redirectPath: "/bench/unauthorized",
    allowRedirectBack: false,
    authenticatedSelector: (state) =>
      Boolean(state.currentUser && state.currentUser.is_superuser),
    redirectAction: routerActions.replace,
    context: MetabaseReduxContext,
  });

  return Wrapper(Component ?? (({ children }) => children));
};
