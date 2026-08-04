import { useEffect, useMemo, useRef } from "react";

import { useUserKeyValue } from "metabase/common/hooks/use-user-key-value";
import { useDispatch } from "metabase/redux";
import { replace, useRouter } from "metabase/router";
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
  const { location } = useRouter();
  const isInitializingRef = useRef(false);
  const dispatch = useDispatch();

  const {
    value: rawLastUsedParams,
    isLoading: isLoadingParams,
    setValue: setLastUsedParams,
  } = useUserKeyValue({
    namespace: "content_diagnostics",
    key: "duplicated",
  });

  const shouldRestoreLastUsedParamsRef = useRef(
    isEmptyDuplicatedParams(location),
  );

  const params = useMemo(() => {
    return shouldRestoreLastUsedParamsRef.current
      ? parseDuplicatedUserParams(rawLastUsedParams)
      : parseDuplicatedUrlParams(location);
  }, [location, rawLastUsedParams]);

  const handleParamsChange = (
    params: Urls.DuplicatedContentParams,
    { withSetLastUsedParams = false }: ContentDiagnosticsParamsOptions = {},
  ) => {
    const paramsWithoutDefaults = getDuplicatedParamsWithoutDefaults(params);

    if (withSetLastUsedParams) {
      setLastUsedParams(getDuplicatedUserParams(paramsWithoutDefaults));
    }
    dispatch(replace(Urls.duplicatedContent(paramsWithoutDefaults)));
  };

  useEffect(() => {
    if (!isInitializingRef.current && !isLoadingParams) {
      isInitializingRef.current = true;
      shouldRestoreLastUsedParamsRef.current = false;
      dispatch(
        replace(
          Urls.duplicatedContent(getDuplicatedParamsWithoutDefaults(params)),
        ),
      );
    }
  }, [params, isLoadingParams, dispatch]);

  return (
    <DuplicatedContent
      params={params}
      isLoadingParams={isLoadingParams}
      onParamsChange={handleParamsChange}
    />
  );
}
