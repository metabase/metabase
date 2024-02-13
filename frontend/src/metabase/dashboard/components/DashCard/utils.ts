import _ from "underscore";
import type {
  BaseDashboardCard,
  DashboardCard,
  ParameterTarget,
  QuestionDashboardCard,
  StructuredParameterDimensionTarget,
} from "metabase-types/api";
import {
  getVirtualCardType,
  isActionDashCard,
  isNativeDashCard,
  isQuestionDashCard,
  isVirtualDashCard,
} from "metabase/dashboard/utils";
import * as Lib from "metabase-lib";
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

// TODO: @uladzimirdev fix type definition in https://github.com/metabase/metabase/pull/38596
type MappingOption = {
  name: string;
  icon: string;
  isForeign: boolean;
  target: StructuredParameterDimensionTarget;
};

export function getMappingOptionByTarget<T extends DashboardCard>(
  mappingOptions: MappingOption[],
  dashcard: T,
  target: ParameterTarget,
  question: T extends QuestionDashboardCard ? Question : never,
): MappingOption | undefined {
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

  const stageIndex = -1;
  const columns = Lib.visibleColumns(question.query(), stageIndex);
  const normalizedTarget = normalize(target[1]);

  const [columnByTargetIndex] = Lib.findColumnIndexesFromLegacyRefs(
    question.query(),
    stageIndex,
    columns,
    [normalizedTarget],
  );

  // target not found - no need to look further
  if (columnByTargetIndex === -1) {
    return;
  }

  const mappingColumnIndexes = Lib.findColumnIndexesFromLegacyRefs(
    question.query(),
    stageIndex,
    columns,
    mappingOptions.map(({ target }) => normalize(target[1])),
  );

  const mappingIndex = mappingColumnIndexes.indexOf(columnByTargetIndex);

  if (mappingIndex >= 0) {
    return mappingOptions[mappingIndex];
  }
}
