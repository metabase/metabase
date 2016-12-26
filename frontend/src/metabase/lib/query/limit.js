/* @flow */

import type { LimitClause } from "metabase/meta/types/Query";

export function updateLimit(bc: ?LimitClause, limit: ?LimitClause): ?LimitClause {
    return limit;
}

export function clearLimit(bc: ?LimitClause): ?LimitClause {
    return undefined;
}
