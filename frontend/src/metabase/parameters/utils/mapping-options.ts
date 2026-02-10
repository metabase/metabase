import { t } from "ttag";
import _ from "underscore";

import { tag_names } from "cljs/metabase.parameters.shared";
import { getColumnIcon } from "metabase/common/utils/columns";
import {
  isActionDashCard,
  isQuestionDashCard,
  isVirtualDashCard,
} from "metabase/dashboard/utils";
import { getGroupName } from "metabase/querying/filters/utils/groups";
import { getAllowedIframeAttributes } from "metabase/visualizations/visualizations/IFrameViz/utils";
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
import { normalize } from "metabase-lib/v1/queries/utils/normalize";
import type TemplateTagVariable from "metabase-lib/v1/variables/TemplateTagVariable";
import type {
  BaseDashboardCard,
  Card,
  DimensionReference,
  NativeParameterDimensionTarget,
  Parameter,
  ParameterTarget,
  ParameterVariableTarget,
  StructuredParameterDimensionTarget,
  VirtualCard,
  WritebackParameter,
} from "metabase-types/api";
import { isStructuredDimensionTarget } from "metabase-types/guards";

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
  columns: Lib.ColumnMetadata[],
): StructuredQuerySectionOption[] {
  const groupInfo = Lib.displayInfo(query, stageIndex, group);

  return columns.map((column) => {
    const columnInfo = Lib.displayInfo(query, stageIndex, column);

    return {
      sectionName: getGroupName(groupInfo, stageIndex) ?? t`Summaries`,
      name: columnInfo.displayName,
      icon: getColumnIcon(column),
      target: buildColumnTarget(query, stageIndex, column),
      isForeign: columnInfo.isFromJoin || columnInfo.isImplicitlyJoinable,
    };
  });
}

function buildNativeQuerySectionOptions(
  section: DimensionOptionsSection,
  stageIndex: number,
): NativeParameterMappingOption[] {
  return section.items
    .flatMap(({ dimension }) =>
      dimension instanceof TemplateTagDimension ? [dimension] : [],
    )
    .map((dimension) => ({
      name: dimension.displayName(),
      icon: dimension.icon() ?? "",
      isForeign: false,
      target: buildDimensionTarget(dimension, stageIndex),
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

export type GetParameterMappingOptionsOpts = {
  includeSensitiveFields?: boolean;
};

export function getParameterMappingOptions(
  question: Question | undefined,
  parameter: Parameter | null | undefined = null,
  card: Card | VirtualCard,
  dashcard: BaseDashboardCard | null | undefined = null,
  parameterDashcard: BaseDashboardCard | null | undefined = null,
  opts?: GetParameterMappingOptionsOpts,
): ParameterMappingOption[] {
  const isInlineParameterOnCardFromOtherTab =
    parameterDashcard != null &&
    parameterDashcard.dashboard_tab_id !== dashcard?.dashboard_tab_id;
  if (isInlineParameterOnCardFromOtherTab) {
    return [];
  }

  const isInlineParameterOfAnotherQuestionCard =
    parameterDashcard != null &&
    isQuestionDashCard(parameterDashcard) &&
    parameterDashcard.id !== dashcard?.id;

  // Check if there's an existing connection between this parameter and this specific dashcard/card combo
  const hasExistingConnection =
    parameter != null &&
    dashcard != null &&
    isQuestionDashCard(dashcard) &&
    "id" in card &&
    dashcard.parameter_mappings?.some(
      (mapping) =>
        mapping.parameter_id === parameter.id && mapping.card_id === card.id,
    );

  // Only block if it's an inline parameter of another card AND there's no existing connection
  // to allow users to see and potentially disconnect existing connections
  if (isInlineParameterOfAnotherQuestionCard && !hasExistingConnection) {
    return [];
  }

  if (dashcard && isVirtualDashCard(dashcard)) {
    if (["heading", "text"].includes(card.display)) {
      const tagNames = tag_names(dashcard.visualization_settings.text || "");
      return tagNames?.map(buildTextTagOption) ?? [];
    } else if (card.display === "iframe") {
      const iframeAttributes = getAllowedIframeAttributes(
        dashcard.visualization_settings.iframe,
      );
      const tagNames = tag_names(iframeAttributes?.src || "");
      return tagNames?.map(buildTextTagOption) ?? [];
    } else if (card.display === "link") {
      const tagNames = tag_names(dashcard.visualization_settings.link?.url);
      return tagNames?.map(buildTextTagOption) ?? [];
    }
  }

  if (dashcard && isActionDashCard(dashcard)) {
    const actionParams = dashcard?.action?.parameters?.map((param) => ({
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
    const { query, columns } = getParameterColumns(
      question,
      parameter ?? undefined,
      opts,
    );

    const columnsByStageIndex = _.groupBy(columns, "stageIndex");
    const options = Object.entries(columnsByStageIndex).flatMap(
      ([stageIndexString, columns]) => {
        const groups = Lib.groupColumns(columns.map(({ column }) => column));
        const stageIndex = parseInt(stageIndexString, 10);

        return groups.flatMap((group) =>
          buildStructuredQuerySectionOptions(
            query,
            stageIndex,
            group,
            Lib.getColumnsFromColumnGroup(group),
          ),
        );
      },
    );

    return options;
  }

  const legacyNativeQuery = question.legacyNativeQuery();
  const options: NativeParameterMappingOption[] = [];
  const stageIndex = Lib.stageCount(question.query()) - 1;

  if (!legacyNativeQuery) {
    return options;
  }

  options.push(
    ...legacyNativeQuery
      .variables(parameter ? variableFilterForParameter(parameter) : undefined)
      .map(buildVariableOption),
  );
  options.push(
    ...legacyNativeQuery
      .dimensionOptions(
        parameter ? dimensionFilterForParameter(parameter) : undefined,
      )
      .sections()
      .flatMap((section) =>
        buildNativeQuerySectionOptions(section, stageIndex),
      ),
  );

  return options;
}

export function getMappingOptionByTarget(
  mappingOptions: ParameterMappingOption[],
  target?: ParameterTarget | null,
  question?: Question,
  parameter?: Parameter,
): ParameterMappingOption | undefined {
  if (!target) {
    return;
  }

  const matchedMappingOptions = mappingOptions.filter((mappingOption) =>
    _.isEqual(mappingOption.target, target),
  );
  // Native queries - targets CAN be tested for equality
  // MBQL queries - targets generally CANNOT be tested for equality, but if there is an exact match, we use it to
  // optimize performance
  if (matchedMappingOptions.length === 1) {
    return matchedMappingOptions[0];
  }
  // `Lib.findColumnIndexesFromLegacyRefs` throws for non-MBQL references, so we
  // need to ignore such references here
  if (!question || !isStructuredDimensionTarget(target)) {
    return undefined;
  }

  const { query, columns } = getParameterColumns(question, parameter);
  const stageCount = Lib.stageCount(query);
  const lastStageIndex = stageCount - 1;
  const stageIndex = getStageIndexFromTarget(target) ?? lastStageIndex;
  if (stageIndex >= stageCount) {
    return;
  }

  const stageColumns = columns
    .filter((column) => column.stageIndex === stageIndex)
    .map(({ column }) => column);
  const stageMappingOptions = mappingOptions.filter(
    ({ target }) => getStageIndexFromTarget(target) === stageIndex,
  );

  const normalizedTarget = normalize(target as any);
  const fieldRef = (normalizedTarget as any)[1];
  const [columnByTargetIndex] = Lib.findColumnIndexesFromLegacyRefs(
    query,
    stageIndex,
    stageColumns,
    [fieldRef],
  );

  if (columnByTargetIndex !== -1) {
    const mappingColumnIndexes = Lib.findColumnIndexesFromLegacyRefs(
      query,
      stageIndex,
      stageColumns,
      stageMappingOptions.map(({ target }) => target[1] as DimensionReference),
    );

    const mappingIndex = mappingColumnIndexes.indexOf(columnByTargetIndex);
    if (mappingIndex >= 0) {
      return stageMappingOptions[mappingIndex];
    }
  }

  return undefined;
}

function getStageIndexFromTarget(target: ParameterTarget): number | undefined {
  if (isStructuredDimensionTarget(target)) {
    return target[2]?.["stage-number"];
  }
}
