import { t } from "ttag";
import { isFK, isPK } from "metabase/lib/schema_metadata";
import * as Urls from "metabase/lib/urls";
import { zoomInRow } from "metabase/query_builder/actions";

function hasManyPKColumns(question) {
  const table = question.query().table();
  const fields = table?.fields ?? question.getResultMetadata();
  return fields.filter(field => isPK(field)).length > 1;
}

function getActionForPKColumn({ question, column, objectId, extraData }) {
  if (hasManyPKColumns(question)) {
    // Filter by a clicked value, then a user can click on the 2nd, 3d, ..., Nth PK cells
    // to narrow down filtering and eventually enter the object detail view once all PKs are filtered
    return ["question", () => question.filter("=", column, objectId)];
  }

  const isDashboard = !!extraData?.dashboard;
  if (isDashboard) {
    const { parameterValuesBySlug = {} } = extraData;
    const hasParameters = Object.keys(parameterValuesBySlug).length > 0;

    // This should result in a metabase/dashboard/actions navigateToNewCardFromDashboard call
    // That will convert dashboard parameters into question filters
    // and make sure the clicked row will be present in the query results
    if (hasParameters) {
      const getNextQuestion = () => question;
      const getExtraData = () => ({ objectId });
      return ["question", getNextQuestion, getExtraData];
    }

    return ["url", () => Urls.question(question.card(), { objectId })];
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
  const [actionKey, action, extra] = getActionForPKColumn({
    question,
    column,
    objectId,
    extraData,
  });
  actionObject[actionKey] = action;
  if (extra) {
    actionObject.extra = extra;
  }
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
  return actionObject ? [actionObject] : [];
};
