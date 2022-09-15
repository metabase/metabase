import { t } from "ttag";

import { isFK, isPK } from "metabase/lib/schema_metadata";
import { zoomInRow } from "metabase/query_builder/actions";
import { isAggregateField } from "metabase/lib/query/field_ref";
import { Field } from "metabase-types/types/Query";
import {
  ClickAction,
  ClickActionProps,
} from "metabase-types/types/Visualization";
import { Column, Value } from "metabase-types/types/Dataset";

import Question from "metabase-lib/lib/Question";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import Metadata from "metabase-lib/lib/metadata/Metadata";

function hasManyPKColumns(question: Question) {
  const query = question.query();
  if (!(query instanceof StructuredQuery)) {
    throw new Error("query must be a StructuredQuery");
  }
  const fields = question.isDataset()
    ? question.getResultMetadata() ?? query.table?.()?.fields
    : query.table?.()?.fields ?? question.getResultMetadata();

  return fields.filter((field: Field) => isPK(field)).length > 1;
}

type Params = {
  objectId?: Value;
  column?: Column;
  extra?: () => any;
} & Pick<ClickActionProps, "question" | "extraData">;

function getActionForPKColumn({
  question,
  column,
  objectId,
  extraData,
}: Params): ["question" | "action", () => any] {
  if (hasManyPKColumns(question)) {
    return ["question", () => question.filter("=", column, objectId)];
  }

  const isDashboard = !!extraData?.dashboard;

  // the question from the dashboard may have filters applied already
  if (isDashboard) {
    return ["question", () => question];
  }

  return ["action", () => zoomInRow({ objectId })];
}

function getBaseActionObject(): Partial<ClickAction> {
  return {
    name: "object-detail",
    section: "details",
    title: t`View details`,
    buttonType: "horizontal" as const,
    icon: "expand",
    default: true,
  };
}

function getPKAction({ question, column, objectId, extraData }: Params) {
  const actionObject = getBaseActionObject();
  const [actionKey, action] = getActionForPKColumn({
    question,
    column,
    objectId,
    extraData,
  });
  actionObject[actionKey] = action;
  return actionObject;
}

function getFKTargetField(column: Column, metadata: Metadata) {
  const fkField = metadata.field(column.id as any);
  if (fkField?.target) {
    return fkField.target;
  }
  if (column.fk_target_field_id) {
    const targetField = metadata.field(column.fk_target_field_id);
    return targetField;
  }
  return null;
}

function getFKAction({ question, column, objectId }: Params) {
  const actionObject = getBaseActionObject();
  if (!column) {
    return;
  }
  const targetField = getFKTargetField(column, question.metadata());
  if (!targetField) {
    return;
  }
  actionObject.question = () => question.drillPK(targetField, objectId);
  actionObject.icon = "grid";
  return actionObject;
}

export default ({ question, clicked }: ClickActionProps): ClickAction[] => {
  if (
    !clicked?.column ||
    clicked?.value === undefined ||
    !question.query().isEditable()
  ) {
    return [];
  }
  const { column, value, extraData, data } = clicked;
  if (isFK(clicked.column) || isPK(clicked.column)) {
    const objectId = value;
    const params: Params = { question, column, objectId, extraData };
    const actionObject = isPK(column)
      ? getPKAction(params)
      : getFKAction(params);
    if (actionObject && !hasManyPKColumns(question)) {
      actionObject.extra = () => ({ objectId });
    }
    return actionObject ? [actionObject] : [];
  } else if (
    !hasManyPKColumns(question) &&
    !isAggregateField(column.field_ref)
  ) {
    const { value: objectId, col: column } =
      data?.find(({ col }) => isPK(col)) || {};
    const params: Params = {
      question,
      column,
      objectId,
      extraData,
      extra: () => ({ objectId }),
    };
    const action = getPKAction(params);
    action.default = false;
    return [action];
  }
  return [];
};
