import { useEffect, useMemo, useRef } from "react";

import { useUserKeyValue } from "metabase/current-user";
import { useNavigate, useSearchParams } from "metabase/router";
import * as Urls from "metabase/urls";

import { DuplicatedContent } from "../components";
import { getDuplicatedParamsWithoutDefaults } from "../components/duplicated-utils";
import type { ContentDiagnosticsParamsOptions } from "../components/types";

import {
  getDuplicatedUserParams,
  isEmptyDuplicatedParams,
  parseDuplicatedUrlParams,
  parseDuplicatedUserParams,
} from "./duplicated-utils";

export function DuplicatedContentPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isInitializingRef = useRef(false);

  const {
    value: rawLastUsedParams,
    isLoading: isLoadingParams,
    setValue: setLastUsedParams,
  } = useUserKeyValue({
    namespace: "content_diagnostics",
    key: "duplicated",
  });

  const shouldRestoreLastUsedParamsRef = useRef(
    isEmptyDuplicatedParams(searchParams),
  );

  const params = useMemo(() => {
    return shouldRestoreLastUsedParamsRef.current
      ? parseDuplicatedUserParams(rawLastUsedParams)
      : parseDuplicatedUrlParams(searchParams);
  }, [searchParams, rawLastUsedParams]);

  const handleParamsChange = (
    params: Urls.DuplicatedContentParams,
    { withSetLastUsedParams = false }: ContentDiagnosticsParamsOptions = {},
  ) => {
    const paramsWithoutDefaults = getDuplicatedParamsWithoutDefaults(params);

    if (withSetLastUsedParams) {
      setLastUsedParams(getDuplicatedUserParams(paramsWithoutDefaults));
    }
    navigate(Urls.duplicatedContent(paramsWithoutDefaults), { replace: true });
  };

  useEffect(() => {
    if (!isInitializingRef.current && !isLoadingParams) {
      isInitializingRef.current = true;
      shouldRestoreLastUsedParamsRef.current = false;
      navigate(
        Urls.duplicatedContent(getDuplicatedParamsWithoutDefaults(params)),
        { replace: true },
      );
    }
  }, [params, isLoadingParams, navigate]);

  return (
    <DuplicatedContent
      params={params}
      isLoadingParams={isLoadingParams}
      onParamsChange={handleParamsChange}
    />
  );
}
