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

  if (!question) {
    return;
  }

  const stageIndex = -1;
  const query = question.query();
  const columns = Lib.visibleColumns(query, stageIndex);
  const normalizedTarget = normalize(target[1]);

  const [columnByTargetIndex] = Lib.findColumnIndexesFromLegacyRefs(
    query,
    stageIndex,
    columns,
    [normalizedTarget],
  );

  // target not found - no need to look further
  if (columnByTargetIndex === -1) {
    return;
  }

  const mappingColumnIndexes = Lib.findColumnIndexesFromLegacyRefs(
    query,
    stageIndex,
    columns,
    mappingOptions.map(({ target }) => normalize(target[1])),
  );

  const mappingIndex = mappingColumnIndexes.indexOf(columnByTargetIndex);

  if (mappingIndex >= 0) {
    return mappingOptions[mappingIndex];
  }
}
