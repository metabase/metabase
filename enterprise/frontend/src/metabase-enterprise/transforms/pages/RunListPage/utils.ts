import type { Location } from "history";

import type * as Urls from "metabase/lib/urls";

import {
  parseInteger,
  parseList,
  parseRunMethod,
  parseRunStatus,
  parseString,
} from "../../utils";

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
    page: parseInteger(page),
    statuses: parseList(statuses, parseRunStatus),
    transform_ids: parseList(transform_ids, parseInteger),
    transform_tag_ids: parseList(transform_tag_ids, parseInteger),
    start_time: parseString(start_time),
    end_time: parseString(end_time),
    run_methods: parseList(run_methods, parseRunMethod),
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
