import { useEffect, useMemo, useRef } from "react";

import { useUserKeyValue } from "metabase/current-user";
import { useNavigate, useSearchParams } from "metabase/router";
import * as Urls from "metabase/urls";
import type { ContentDiagnosticsImbalancedFindingType } from "metabase-types/api";

import { ImbalancedContent } from "../components";
import { getImbalancedParamsWithoutDefaults } from "../components/imbalanced-utils";
import type { ContentDiagnosticsParamsOptions } from "../components/types";

import {
  getImbalancedUserParams,
  isEmptyImbalancedParams,
  parseImbalancedUrlParams,
  parseImbalancedUserParams,
} from "./imbalanced-utils";

type ImbalancedContentPageProps = {
  mode: ContentDiagnosticsImbalancedFindingType;
};

function ImbalancedContentPage({ mode }: ImbalancedContentPageProps) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isInitializingRef = useRef(false);

  const {
    value: rawLastUsedParams,
    isLoading: isLoadingParams,
    setValue: setLastUsedParams,
  } = useUserKeyValue({
    namespace: "content_diagnostics",
    key: mode,
  });

  const shouldRestoreLastUsedParamsRef = useRef(
    isEmptyImbalancedParams(searchParams),
  );

  const params = useMemo(() => {
    return shouldRestoreLastUsedParamsRef.current
      ? parseImbalancedUserParams(rawLastUsedParams)
      : parseImbalancedUrlParams(searchParams);
  }, [searchParams, rawLastUsedParams]);

  const handleParamsChange = (
    params: Urls.ImbalancedContentParams,
    { withSetLastUsedParams = false }: ContentDiagnosticsParamsOptions = {},
  ) => {
    const paramsWithoutDefaults = getImbalancedParamsWithoutDefaults(params);

    if (withSetLastUsedParams) {
      setLastUsedParams(getImbalancedUserParams(paramsWithoutDefaults));
    }
    navigate(Urls.imbalancedContent(mode, paramsWithoutDefaults), {
      replace: true,
    });
  };

  useEffect(() => {
    if (!isInitializingRef.current && !isLoadingParams) {
      isInitializingRef.current = true;
      shouldRestoreLastUsedParamsRef.current = false;
      navigate(
        Urls.imbalancedContent(
          mode,
          getImbalancedParamsWithoutDefaults(params),
        ),
        { replace: true },
      );
    }
  }, [mode, params, isLoadingParams, navigate]);

  return (
    <ImbalancedContent
      mode={mode}
      params={params}
      isLoadingParams={isLoadingParams}
      onParamsChange={handleParamsChange}
    />
  );
}

export function EmptyContentPage() {
  return <ImbalancedContentPage mode="empty" />;
}

export function SparseContentPage() {
  return <ImbalancedContentPage mode="sparse" />;
}

export function CrowdedContentPage() {
  return <ImbalancedContentPage mode="crowded" />;
}
