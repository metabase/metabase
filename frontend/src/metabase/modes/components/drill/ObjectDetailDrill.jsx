import { t } from "ttag";
import { isFK, isPK } from "metabase/lib/schema_metadata";
import { zoomInRow } from "metabase/query_builder/actions";

function hasManyPKColumns(question) {
  return (
    question
      .query()
      .table()
      .fields.filter(field => field.isPK()).length > 1
  );
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

function getFKAction({ question, column, objectId }) {
  const actionObject = getBaseActionObject();
  const fkField = question.metadata().field(column.id);
  if (!fkField?.target) {
    return;
  }
  actionObject.question = () => question.drillPK(fkField.target, objectId);
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
  actionObject.zoomInRow = objectId;
  return actionObject ? [actionObject] : [];
};
