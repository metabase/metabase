import type { Location } from "metabase/router";
import * as Urls from "metabase/urls";
import { TRANSFORM_TEST_RUN_STATUSES } from "metabase-types/api";

export function getParsedParams(
  location: Location,
): Urls.TransformTestRunListParams {
  const searchParams = new URLSearchParams(location.search);

  return {
    page: Urls.parseNumberParam(searchParams.get("page")),
    statuses: Urls.parseListParam(searchParams.getAll("statuses"), (value) =>
      Urls.parseEnumParam(value, TRANSFORM_TEST_RUN_STATUSES),
    ),
    startTime: Urls.parseStringParam(searchParams.get("start-time")),
    endTime: Urls.parseStringParam(searchParams.get("end-time")),
  };
}
