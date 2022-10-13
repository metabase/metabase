import {
  isAddress,
  isCategory,
  isDate,
} from "metabase-lib/lib/types/utils/isa";

function pivotDrill({ question, clicked, fieldFilter }) {
  const query = question.query();
  if (!question.isStructured() || !query.isEditable()) {
    return null;
  }

  if (
    clicked &&
    (clicked.value === undefined || clicked.column.source !== "aggregation")
  ) {
    return null;
  }

  const breakoutOptions = query.breakoutOptions(null, fieldFilter);
  if (breakoutOptions.count === 0) {
    return null;
  }

  const dimensions = (clicked && clicked.dimensions) || [];
  return { query, dimensions, breakoutOptions };
}

export function pivotByTimeDrill({ question, clicked }) {
  const fieldFilter = field => isDate(field);
  return pivotDrill({ question, clicked, fieldFilter });
}

export function pivotByLocationDrill({ question, clicked }) {
  const fieldFilter = field => isAddress(field);
  return pivotDrill({ question, clicked, fieldFilter });
}

export function pivotByCategoryDrill({ question, clicked }) {
  const fieldFilter = field => isCategory(field) && !isAddress(field);
  return pivotDrill({ question, clicked, fieldFilter });
}
