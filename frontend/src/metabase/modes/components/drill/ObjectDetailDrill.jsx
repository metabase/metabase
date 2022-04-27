import { t } from "ttag";
import { isFK, isPK } from "metabase/lib/schema_metadata";
import * as Urls from "metabase/lib/urls";
import { zoomInRow } from "metabase/query_builder/actions";

function hasManyPKColumns(question) {
  return (
    question
      .query()
      .table()
      .fields.filter(field => field.isPK()).length > 1
  );
}

function getActionForPKColumn({ question, column, objectId, isDashboard }) {
  if (hasManyPKColumns(question)) {
    // Filter by a clicked value, then a user can click on the 2nd, 3d, ..., Nth PK cells
    // to narrow down filtering and eventually enter the object detail view once all PKs are filtered
    return ["question", () => question.filter("=", column, objectId)];
  }
  if (isDashboard) {
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

function getPKAction({ question, column, objectId, isDashboard }) {
  const actionObject = getBaseActionObject();
  const [actionKey, action] = getActionForPKColumn({
    question,
    column,
    objectId,
    isDashboard,
  });
  actionObject[actionKey] = action;
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
  const isDashboard = !!extraData?.dashboard;

  const params = { question, column, objectId, isDashboard };

  const actionObject = isPK(column) ? getPKAction(params) : getFKAction(params);
  return actionObject ? [actionObject] : [];
};
