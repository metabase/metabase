import _ from "underscore";
import type {
  BaseDashboardCard,
  DashboardCard,
  ParameterTarget,
  QuestionDashboardCard,
} from "metabase-types/api";
import {
  getVirtualCardType,
  isActionDashCard,
  isNativeDashCard,
  isQuestionDashCard,
  isVirtualDashCard,
} from "metabase/dashboard/utils";
import * as Lib from "metabase-lib";
import type { ParameterMappingOptions as ParameterMappingOption } from "metabase/parameters/utils/mapping-options";
import { isStructuredQuerySectionOption } from "metabase-types/guards";
import { normalize } from "metabase-lib/queries/utils/normalize";
import type Question from "metabase-lib/Question";

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

  const isVirtual = isVirtualDashCard(dashcard);
  const isAction = isActionDashCard(dashcard);
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
    mappingOptions
      .filter(isStructuredQuerySectionOption)
      .map(({ target }) => target[1]),
  );

  const mappingIndex = mappingColumnIndexes.indexOf(columnByTargetIndex);

  if (mappingIndex >= 0) {
    return mappingOptions[mappingIndex];
  }
}
