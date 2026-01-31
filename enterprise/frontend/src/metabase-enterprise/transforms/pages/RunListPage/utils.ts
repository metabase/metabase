import type { Location } from "history";

import * as Urls from "metabase/lib/urls";
import {
  TRANSFORM_RUN_METHODS,
  TRANSFORM_RUN_STATUSES,
} from "metabase-types/api";

export function getParsedParams(
  location: Location,
): Urls.TransformRunListParams {
  const {
    page,
    statuses,
    transform_ids,
    transform_tag_ids,
    start_time,
    end_time,
    run_methods,
  } = location.query;
  return {
    page: Urls.parseNumberParam(page),
    statuses: Urls.parseListParam(statuses, (v) =>
      Urls.parseEnumParam(v, TRANSFORM_RUN_STATUSES),
    ),
    transform_ids: Urls.parseListParam(transform_ids, Urls.parseNumberParam),
    transform_tag_ids: Urls.parseListParam(
      transform_tag_ids,
      Urls.parseNumberParam,
    ),
    start_time: Urls.parseStringParam(start_time),
    end_time: Urls.parseStringParam(end_time),
    run_methods: Urls.parseListParam(run_methods, (v) =>
      Urls.parseEnumParam(v, TRANSFORM_RUN_METHODS),
    ),
  };
}

export function hasFilterParams(params: Urls.TransformRunListParams) {
  return (
    params.statuses != null ||
    params.transform_ids != null ||
    params.transform_tag_ids != null ||
    params.start_time != null ||
    params.end_time != null ||
    params.run_methods != null
  );
}
