import { t } from "ttag";
import { isFK, isPK } from "metabase/lib/schema_metadata";
import { zoomInRow } from "metabase/query_builder/actions";

function hasManyPKColumns(question) {
  const fields = question.isDataset()
    ? question.getResultMetadata() ?? question.query().table?.()?.fields
    : question.query().table?.()?.fields ?? question.getResultMetadata();

  return fields.filter(field => isPK(field)).length > 1;
}

function getActionForPKColumn({ question, column, objectId, extraData }) {
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

function getBaseActionObject() {
  return {
    name: "object-detail",
    section: "details",
    title: t`View details`,
    buttonType: "horizontal",
    icon: "document",
    default: true,
  };
}

function getPKAction({ question, column, objectId, extraData }) {
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

function getFKTargetField(column, metadata) {
  const fkField = metadata.field(column.id);
  if (fkField?.target) {
    return fkField.target;
  }
  if (column.fk_target_field_id) {
    const targetField = metadata.field(column.fk_target_field_id);
    return targetField;
  }
  return null;
}

function getFKAction({ question, column, objectId }) {
  const actionObject = getBaseActionObject();
  const targetField = getFKTargetField(column, question.metadata());
  if (!targetField) {
    return;
  }
  actionObject.question = () => question.drillPK(targetField, objectId);
  return actionObject;
}

export default ({ question, clicked }) => {
  if (
    !clicked?.column ||
    clicked?.value === undefined ||
    !(isFK(clicked.column) || isPK(clicked.column)) ||
    !question.query().isEditable()
  ) {
    return [];
  }
  const { column, value: objectId, extraData } = clicked;
  const params = { question, column, objectId, extraData };
  const actionObject = isPK(column) ? getPKAction(params) : getFKAction(params);
  if (!hasManyPKColumns(question)) {
    actionObject.extra = () => ({ objectId });
  }
  return actionObject ? [actionObject] : [];
};
