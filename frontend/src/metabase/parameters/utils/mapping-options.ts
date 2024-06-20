import { tag_names } from "cljs/metabase.shared.parameters.parameters";
import { isActionDashCard } from "metabase/actions/utils";
import { getColumnGroupName } from "metabase/common/utils/column-groups";
import { getColumnIcon } from "metabase/common/utils/columns";
import { isVirtualDashCard } from "metabase/dashboard/utils";
import * as Lib from "metabase-lib";
import { TemplateTagDimension } from "metabase-lib/v1/Dimension";
import type { DimensionOptionsSection } from "metabase-lib/v1/DimensionOptions/types";
import type Question from "metabase-lib/v1/Question";
import {
  dimensionFilterForParameter,
  variableFilterForParameter,
} from "metabase-lib/v1/parameters/utils/filters";
import {
  buildColumnTarget,
  buildDimensionTarget,
  buildTemplateTagVariableTarget,
  buildTextTagTarget,
  getParameterColumns,
} from "metabase-lib/v1/parameters/utils/targets";
import type TemplateTagVariable from "metabase-lib/v1/variables/TemplateTagVariable";
import type {
  BaseDashboardCard,
  Card,
  NativeParameterDimensionTarget,
  Parameter,
  ParameterTarget,
  ParameterVariableTarget,
  StructuredParameterDimensionTarget,
  WritebackParameter,
} from "metabase-types/api";

export type StructuredQuerySectionOption = {
  sectionName: string;
  name: string;
  icon: string;
  target: StructuredParameterDimensionTarget;
  isForeign: boolean;
};

function buildStructuredQuerySectionOptions(
  query: Lib.Query,
  stageIndex: number,
  group: Lib.ColumnGroup,
): StructuredQuerySectionOption[] {
  const groupInfo = Lib.displayInfo(query, stageIndex, group);
  const columns = Lib.getColumnsFromColumnGroup(group);

  return columns.map(column => {
    const columnInfo = Lib.displayInfo(query, stageIndex, column);

    return {
      sectionName: getColumnGroupName(groupInfo),
      name: columnInfo.displayName,
      icon: getColumnIcon(column),
      target: buildColumnTarget(query, stageIndex, column),
      isForeign: columnInfo.isFromJoin || columnInfo.isImplicitlyJoinable,
    };
  });
}

function buildNativeQuerySectionOptions(
  section: DimensionOptionsSection,
): NativeParameterMappingOption[] {
  return section.items
    .flatMap(({ dimension }) =>
      dimension instanceof TemplateTagDimension ? [dimension] : [],
    )
    .map(dimension => ({
      name: dimension.displayName(),
      icon: dimension.icon() ?? "",
      isForeign: false,
      target: buildDimensionTarget(dimension),
    }));
}

function buildVariableOption(
  variable: TemplateTagVariable,
): NativeParameterMappingOption {
  return {
    name: variable.displayName() ?? "",
    icon: variable.icon() ?? "",
    isForeign: false,
    target: buildTemplateTagVariableTarget(variable),
  };
}

function buildTextTagOption(tagName: string) {
  return {
    name: tagName,
    icon: "string",
    isForeign: false,
    target: buildTextTagTarget(tagName),
  };
}
type VirtualDashcardParameterMappingOption = {
  name: string;
  icon: string;
  isForeign: boolean;
  target: ParameterTarget;
};

type ActionDashcardParameterMappingOption = WritebackParameter & {
  icon: string;
  isForeign: boolean;
  hasVariableTemplateTagTarget?: boolean;
};

type NativeParameterMappingOption = {
  name: string;
  icon: string;
  isForeign: boolean;
  target: NativeParameterDimensionTarget | ParameterVariableTarget;
};

export type ParameterMappingOption =
  | VirtualDashcardParameterMappingOption
  | ActionDashcardParameterMappingOption
  | StructuredQuerySectionOption
  | NativeParameterMappingOption;

export function getParameterMappingOptions(
  question: Question | undefined,
  parameter: Parameter | null | undefined = null,
  card: Card,
  dashcard: BaseDashboardCard | null | undefined = null,
): ParameterMappingOption[] {
  if (
    dashcard &&
    isVirtualDashCard(dashcard) &&
    ["heading", "text"].includes(card.display)
  ) {
    const tagNames = tag_names(dashcard.visualization_settings.text || "");
    return tagNames ? tagNames.map(buildTextTagOption) : [];
  }

  if (dashcard && isActionDashCard(dashcard)) {
    const actionParams = dashcard?.action?.parameters?.map(param => ({
      icon: "variable",
      isForeign: false,
      ...param,
    }));

    return actionParams || [];
  }

  if (
    !question ||
    !card.dataset_query ||
    (dashcard && isVirtualDashCard(dashcard))
  ) {
    return [];
  }

  const { isNative } = Lib.queryDisplayInfo(question.query());
  if (!isNative) {
    const { query, stageIndex, columns } = getParameterColumns(
      question,
      parameter ?? undefined,
    );
    const columnGroups = Lib.groupColumns(columns);

    const options = columnGroups.flatMap(group =>
      buildStructuredQuerySectionOptions(query, stageIndex, group),
    );

    return options;
  }

  const legacyQuery = question.legacyQuery();
  const options: NativeParameterMappingOption[] = [];

  options.push(
    ...legacyQuery
      .variables(parameter ? variableFilterForParameter(parameter) : undefined)
      .map(buildVariableOption),
  );
  options.push(
    ...legacyQuery
      .dimensionOptions(
        parameter ? dimensionFilterForParameter(parameter) : undefined,
      )
      .sections()
      .flatMap(section => buildNativeQuerySectionOptions(section)),
  );

  return options;
}
