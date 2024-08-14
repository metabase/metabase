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
import { isTemplateTagReference } from "metabase-lib/v1/references";
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

  const isNative = isQuestionDashCard(dashcard)
    ? isNativeDashCard(dashcard)
    : false;

  const isVirtual = isVirtualDashCard(dashcard);
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

  // a parameter mapping could have been created for a SQL query which got
  // reverted to an MBQL query via revision history.
  // `Lib.findColumnIndexesFromLegacyRefs` throws for non-MBQL references, so we
  // need to ignore such references here
  const fieldRef = normalizedTarget[1];
  if (isTemplateTagReference(fieldRef)) {
    return;
  }

  const { query, stageIndex, columns } = getParameterColumns(
    question,
    parameter,
  );

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
