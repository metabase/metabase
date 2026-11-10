import type { CallLog } from "fetch-mock";

import { Nav } from "metabase/detail-view/components";
import { useSelector } from "metabase/redux";
import { getDetailViewState } from "metabase/selectors/app";
import { Box } from "metabase/ui";
import type { FieldId } from "metabase-types/api";

/** Renders the detail view breadcrumbs that the app bar shows for the current page. */
export const DetailViewNav = () => {
  const detailView = useSelector(getDetailViewState);

  return (
    <Box data-testid="detail-view-nav">
      {detailView && <Nav detailView={detailView} />}
    </Box>
  );
};

/**
 * Returns the value of the `=` filter on the given primary key field in the
 * first stage of an ad-hoc query request, or `undefined` when there is none.
 */
export function getPkFilterValue(call: CallLog, pkFieldId: FieldId): unknown {
  const query: unknown = JSON.parse(String(call.options.body));
  const pkFilter = getFirstStageFilters(query)
    .filter(isUnknownArray)
    .find(
      (clause) =>
        clause.length === 4 &&
        clause[0] === "=" &&
        isFieldRef(clause[2], pkFieldId),
    );

  return pkFilter?.[3];
}

function getFirstStageFilters(query: unknown): unknown[] {
  if (
    typeof query !== "object" ||
    query === null ||
    !("stages" in query) ||
    !isUnknownArray(query.stages)
  ) {
    return [];
  }

  const [stage] = query.stages;
  if (
    typeof stage !== "object" ||
    stage === null ||
    !("filters" in stage) ||
    !isUnknownArray(stage.filters)
  ) {
    return [];
  }

  return stage.filters;
}

function isFieldRef(ref: unknown, fieldId: FieldId): boolean {
  return isUnknownArray(ref) && ref[0] === "field" && ref[2] === fieldId;
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}
