import { tag_names } from "cljs/metabase.shared.parameters.parameters";
import { isActionDashCard } from "metabase/actions/utils";
import { isVirtualDashCard } from "metabase/dashboard/utils";
import { getColumnIcon } from "metabase/common/utils/columns";
import { getColumnGroupName } from "metabase/common/utils/column-groups";
import * as Lib from "metabase-lib";
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
import {
  columnFilterForParameter,
  dimensionFilterForParameter,
  variableFilterForParameter,
} from "metabase-lib/parameters/utils/filters";
import {
  buildColumnTarget,
  buildDimensionTarget,
  buildTemplateTagVariableTarget,
  buildTextTagTarget,
} from "metabase-lib/parameters/utils/targets";
import type Question from "metabase-lib/Question";
import type TemplateTagVariable from "metabase-lib/variables/TemplateTagVariable";
import type { DimensionOptionsSection } from "metabase-lib/DimensionOptions/types";

export type StructuredQuerySectionOptions = {
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
): StructuredQuerySectionOptions[] {
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
): NativeParameterMappingOptions[] {
  return section.items.map(({ dimension }) => ({
    name: dimension.displayName(),
    icon: dimension.icon() ?? "",
    isForeign: false,
    target: buildDimensionTarget(dimension) as NativeParameterDimensionTarget,
  }));
}

function buildVariableOption(
  variable: TemplateTagVariable,
): NativeParameterMappingOptions {
  return {
    name: variable.displayName() ?? "",
    icon: variable.icon() ?? "",
    isForeign: false,
    target: buildTemplateTagVariableTarget(variable) as ParameterVariableTarget,
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
type VirtualDashcardParameterMappingOptions = {
  name: string;
  icon: string;
  isForeign: boolean;
  target: ParameterTarget;
};

type ActionDashcardParameterMappingOptions = WritebackParameter & {
  icon: string;
  isForeign: boolean;
  hasVariableTemplateTagTarget?: boolean;
};

type NativeParameterMappingOptions = {
  name: string;
  icon: string;
  isForeign: boolean;
  target: NativeParameterDimensionTarget | ParameterVariableTarget;
};

export type ParameterMappingOptions =
  | VirtualDashcardParameterMappingOptions
  | ActionDashcardParameterMappingOptions
  | StructuredQuerySectionOptions
  | NativeParameterMappingOptions;

export function getParameterMappingOptions(
  question: Question,
  parameter: Parameter | null | undefined = null,
  card: Card,
  dashcard: BaseDashboardCard | null | undefined = null,
): ParameterMappingOptions[] {
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

  if (!card.dataset_query || (dashcard && isVirtualDashCard(dashcard))) {
    return [];
  }

  const { isNative } = Lib.queryDisplayInfo(question.query());
  if (!isNative || question.isDataset()) {
    // treat the dataset/model question like it is already composed so that we can apply
    // dataset/model-specific metadata to the underlying dimension options
    const query = question.isDataset()
      ? question.composeDataset().query()
      : question.query();
    const stageIndex = -1;
    const availableColumns = Lib.filterableColumns(query, stageIndex);
    const parameterColumns = parameter
      ? availableColumns.filter(columnFilterForParameter(parameter))
      : availableColumns;
    const columnGroups = Lib.groupColumns(parameterColumns);

    const options = columnGroups.flatMap(group =>
      buildStructuredQuerySectionOptions(query, stageIndex, group),
    );

    return options;
  }

  const legacyQuery = question.legacyQuery();
  const options: NativeParameterMappingOptions[] = [];

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
