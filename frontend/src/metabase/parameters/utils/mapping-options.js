import { tag_names } from "cljs/metabase.shared.parameters.parameters";
import { isActionDashCard } from "metabase/actions/utils";
import { isVirtualDashCard } from "metabase/dashboard/utils";
import { getColumnIcon } from "metabase/common/utils/columns";
import { getColumnGroupName } from "metabase/common/utils/column-groups";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/Question";
import {
  columnFilterForParameter,
  dimensionFilterForParameter,
  getTagOperatorFilterForParameter,
  variableFilterForParameter,
} from "metabase-lib/parameters/utils/filters";
import {
  buildColumnTarget,
  buildDimensionTarget,
  buildTemplateTagVariableTarget,
  buildTextTagTarget,
} from "metabase-lib/parameters/utils/targets";

function buildStructuredQuerySectionOptions(query, stageIndex, group) {
  const groupInfo = Lib.displayInfo(query, stageIndex, group);
  const columns = Lib.getColumnsFromColumnGroup(group);

  return columns.map(column => {
    const columnInfo = Lib.displayInfo(query, stageIndex, column);

    return {
      sectionName: getColumnGroupName(groupInfo),
      name: columnInfo.displayName,
      icon: getColumnIcon(column),
      target: buildColumnTarget(column),
      isForeign: columnInfo.isFromJoin || columnInfo.isImplicitlyJoinable,
    };
  });
}

function buildNativeQuerySectionOptions(section) {
  return section.items.map(({ dimension }) => ({
    name: dimension.displayName(),
    icon: dimension.icon(),
    isForeign: false,
    target: buildDimensionTarget(dimension),
  }));
}

function buildVariableOption(variable) {
  return {
    name: variable.displayName(),
    icon: variable.icon(),
    isForeign: false,
    target: buildTemplateTagVariableTarget(variable),
  };
}

function buildTextTagOption(tagName) {
  return {
    name: tagName,
    icon: "string",
    isForeign: false,
    target: buildTextTagTarget(tagName),
  };
}

/**
 *
 * @param {import("metabase-lib/metadata/Metadata").default} metadata
 * @param {import("metabase-types/api").Parameter|null} parameter
 * @param {import("metabase-types/api").Card} card
 * @param {import("metabase-types/store").DashboardCard|null} [dashcard]
 * @returns {*}
 */
export function getParameterMappingOptions(
  metadata,
  parameter = null,
  card,
  dashcard = null,
) {
  if (dashcard && ["heading", "text"].includes(card.display)) {
    const tagNames = tag_names(dashcard.visualization_settings.text || "");
    return tagNames ? tagNames.map(buildTextTagOption) : [];
  }

  if (isActionDashCard(dashcard)) {
    const actionParams = dashcard?.action?.parameters?.map(param => ({
      icon: "variable",
      isForeign: false,
      name: param.id,
      ...param,
    }));

    return actionParams || [];
  }

  if (!card.dataset_query || isVirtualDashCard(dashcard)) {
    return [];
  }

  const question = new Question(card, metadata);
  const options = [];
  if (question.isStructured() || question.isDataset()) {
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
    return columnGroups.flatMap(group =>
      buildStructuredQuerySectionOptions(query, stageIndex, group),
    );
  } else {
    const legacyQuery = question.legacyQuery();
    options.push(
      ...legacyQuery
        .variables(
          parameter ? variableFilterForParameter(parameter) : undefined,
        )
        .map(buildVariableOption),
    );
    options.push(
      ...legacyQuery
        .dimensionOptions(
          parameter ? dimensionFilterForParameter(parameter) : undefined,
          parameter ? getTagOperatorFilterForParameter(parameter) : undefined,
        )
        .sections()
        .flatMap(section => buildNativeQuerySectionOptions(section)),
    );
  }

  return options;
}
