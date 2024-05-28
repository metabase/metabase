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
import { normalize } from "metabase-lib/v1/queries/utils/normalize";
import type {
  BaseDashboardCard,
  DashboardCard,
  ParameterTarget,
  QuestionDashboardCard,
} from "metabase-types/api";
import { isDimensionTarget } from "metabase-types/guards";

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

  if (isVirtual || isAction || isNative) {
    const normalizedTarget = normalize(target);

    return mappingOptions.find(mappingOption =>
      _.isEqual(normalize(mappingOption.target), normalizedTarget),
    );
  }

  if (!question || !isDimensionTarget(target)) {
    return;
  }

  const query = question.query();
  const stageIndex = -1;
  const columns = Lib.visibleColumns(query, stageIndex);
  const fieldRef = target[1];
  const [columnIndex] = Lib.findColumnIndexesFromLegacyRefs(
    query,
    stageIndex,
    columns,
    [fieldRef],
  );
  if (columnIndex < 0) {
    return;
  }

  const column = columns[columnIndex];
  const columnMappingOptions = mappingOptions.filter(option =>
    isDimensionTarget(option.target),
  );
  const columnTargetFieldRefs = columnMappingOptions
    .map(({ target }) => target)
    .filter(isDimensionTarget)
    .map(target => target[1]);
  const mappingOptionIndexes = Lib.findColumnIndexesFromLegacyRefs(
    query,
    stageIndex,
    [column],
    columnTargetFieldRefs,
  );

  const mappingOptionIndex = mappingOptionIndexes.findIndex(
    index => index >= 0,
  );
  if (mappingOptionIndex < 0) {
    return;
  }

  return columnMappingOptions[mappingOptionIndex];
}
