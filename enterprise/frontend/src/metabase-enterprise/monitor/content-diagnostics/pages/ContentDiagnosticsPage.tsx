import type { ComponentType } from "react";
import { useCallback, useEffect, useRef } from "react";

import {
  type UrlStateConfig,
  type UrlStateQuery,
  useUrlState,
} from "metabase/common/hooks/use-url-state";
import { useUserKeyValue } from "metabase/current-user";
import { useLocation } from "metabase/router";
import { parseSearchQuery } from "metabase/utils/browser";
import type {
  ContentDiagnosticsDuplicatedUserParams,
  ContentDiagnosticsImbalancedUserParams,
  ContentDiagnosticsSlowUserParams,
  ContentDiagnosticsStaleUserParams,
} from "metabase-types/api";

import type {
  ContentDiagnosticsParamsOptions,
  ContentDiagnosticsTab,
} from "../components/types";

type DiagnosticsUserParams =
  | ContentDiagnosticsDuplicatedUserParams
  | ContentDiagnosticsImbalancedUserParams
  | ContentDiagnosticsSlowUserParams
  | ContentDiagnosticsStaleUserParams;

type ContentDiagnosticsPageConfig<
  TParams extends Record<string, unknown>,
  TUserParams extends DiagnosticsUserParams,
> = {
  key: ContentDiagnosticsTab;
  urlState: UrlStateConfig<TParams>;
  getParamsWithoutDefaults: (params: TParams) => TParams;
  getUserParams: (params: TParams) => TUserParams;
  parseUserParams: (value: unknown) => TParams;
  hasUrlParams: (query: UrlStateQuery) => boolean;
};

type ContentDiagnosticsContentProps<TParams extends Record<string, unknown>> = {
  params: TParams;
  isLoadingParams: boolean;
  onParamsChange: (
    params: TParams,
    options?: ContentDiagnosticsParamsOptions,
  ) => void;
};

type ContentDiagnosticsPageProps<
  TParams extends Record<string, unknown>,
  TUserParams extends DiagnosticsUserParams,
> = {
  config: ContentDiagnosticsPageConfig<TParams, TUserParams>;
  component: ComponentType<ContentDiagnosticsContentProps<TParams>>;
};

export function ContentDiagnosticsPage<
  TParams extends Record<string, unknown>,
  TUserParams extends DiagnosticsUserParams,
>({
  config,
  component: Content,
}: ContentDiagnosticsPageProps<TParams, TUserParams>) {
  const location = useLocation();
  const [urlParams, { patchUrlState }] = useUrlState(location, config.urlState);
  const shouldRestoreLastUsedParamsRef = useRef(
    !config.hasUrlParams(parseSearchQuery(location.search)),
  );

  const {
    value: rawLastUsedParams,
    isLoading: isLoadingParams,
    setValue: setLastUsedParams,
  } = useUserKeyValue({
    namespace: "content_diagnostics",
    key: config.key,
  });

  const params = shouldRestoreLastUsedParamsRef.current
    ? config.parseUserParams(rawLastUsedParams)
    : urlParams;

  useEffect(() => {
    if (shouldRestoreLastUsedParamsRef.current && !isLoadingParams) {
      shouldRestoreLastUsedParamsRef.current = false;
      patchUrlState(
        config.getParamsWithoutDefaults(
          config.parseUserParams(rawLastUsedParams),
        ),
        { immediate: true },
      );
    }
  }, [config, isLoadingParams, patchUrlState, rawLastUsedParams]);

  const handleParamsChange = useCallback(
    (
      params: TParams,
      { withSetLastUsedParams = false }: ContentDiagnosticsParamsOptions = {},
    ) => {
      const normalizedParams = config.getParamsWithoutDefaults(params);
      if (withSetLastUsedParams) {
        setLastUsedParams(config.getUserParams(normalizedParams));
      }
      // Search input changes are already debounced at the control boundary; all
      // other diagnostics controls are discrete actions. Sync immediately so we
      // do not add a second debounce or leave navigation state temporarily stale.
      patchUrlState(normalizedParams, { immediate: true });
    },
    [config, patchUrlState, setLastUsedParams],
  );

  return (
    <Content
      params={params}
      isLoadingParams={isLoadingParams}
      onParamsChange={handleParamsChange}
    />
  );
}
