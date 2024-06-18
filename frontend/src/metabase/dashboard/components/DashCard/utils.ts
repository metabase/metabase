import _ from "underscore";

import {
  getVirtualCardType,
  isActionDashCard,
  isNativeDashCard,
  isQuestionDashCard,
  isVirtualDashCard,
} from "metabase/dashboard/utils";
import type { ParameterMappingOption as ParameterMappingOption } from "metabase/parameters/utils/mapping-options";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import { getParameterColumns } from "metabase-lib/v1/parameters/utils/targets";
import { normalize } from "metabase-lib/v1/queries/utils/normalize";
import type {
  BaseDashboardCard,
  DashboardCard,
  ParameterTarget,
  QuestionDashboardCard,
  DimensionReference,
  Parameter,
} from "metabase-types/api";

const VIZ_WITH_CUSTOM_MAPPING_UI = ["placeholder", "link"];

export function shouldShowParameterMapper({
  dashcard,
  isEditingParameter,
}: {
  dashcard: BaseDashboardCard;
  isEditingParameter?: boolean;
}) {
  const display = getVirtualCardType(dashcard);
  return (
    isEditingParameter &&
    !(display && VIZ_WITH_CUSTOM_MAPPING_UI.includes(display))
  );
}

export function getMappingOptionByTarget<T extends DashboardCard>(
  mappingOptions: ParameterMappingOption[],
  dashcard: T,
  target?: ParameterTarget | null,
  question?: T extends QuestionDashboardCard ? Question : undefined,
  parameter?: Parameter,
): ParameterMappingOption | undefined {
  if (!target) {
    return;
  }

  const isAction = isActionDashCard(dashcard);
  // action has it's own settings, no need to get mapping options
  if (isAction) {
    return;
  }

  const isVirtual = isVirtualDashCard(dashcard);
  const isNative = isQuestionDashCard(dashcard)
    ? isNativeDashCard(dashcard)
    : false;
  const normalizedTarget = normalize(target);
  const matchedMappingOptions = mappingOptions.filter(mappingOption =>
    _.isEqual(mappingOption.target, normalizedTarget),
  );
  if (isVirtual || isAction || isNative) {
    return matchedMappingOptions[0];
  }
  // performance optimization for MBQL queries:
  // if there is an exact match based on the reference, no need to do complex matching
  if (matchedMappingOptions.length === 1) {
    return matchedMappingOptions[0];
  }
  if (!question) {
    return;
  }

  const { query, stageIndex, columns } = getParameterColumns(
    question,
    parameter,
  );
  const fieldRef = normalizedTarget[1];

  const [columnByTargetIndex] = Lib.findColumnIndexesFromLegacyRefs(
    query,
    stageIndex,
    columns,
    [fieldRef],
  );

  // target not found - no need to look further
  if (columnByTargetIndex === -1) {
    return;
  }

  const mappingColumnIndexes = Lib.findColumnIndexesFromLegacyRefs(
    query,
    stageIndex,
    columns,
    mappingOptions.map(({ target }) => target[1] as DimensionReference),
  );

  const mappingIndex = mappingColumnIndexes.indexOf(columnByTargetIndex);

  if (mappingIndex >= 0) {
    return mappingOptions[mappingIndex];
  }
}
