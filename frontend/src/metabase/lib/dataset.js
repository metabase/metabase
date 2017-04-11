import _ from "underscore";

// Many aggregations result in [[null]] if there are no rows to aggregate after filters
export const datasetContainsNoResults = (data) => data.rows.length === 0 || _.isEqual(data.rows, [[null]])
