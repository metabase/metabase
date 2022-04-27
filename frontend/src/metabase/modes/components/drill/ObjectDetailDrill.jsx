import { t } from "ttag";
import { isFK, isPK } from "metabase/lib/schema_metadata";
import * as Urls from "metabase/lib/urls";
import { zoomInRow } from "metabase/query_builder/actions";
import Question from "metabase-lib/lib/Question";
import { FieldDimension } from "metabase-lib/lib/Dimension";

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

function getActionForFKColumn({ field, objectId }) {
  return [
    "url",
    () => {
      const databaseId = field.table.database.id;
      const tableId = field.table_id;
      const dimension = new FieldDimension(field.id, null, field.metadata);
      const question = Question.create({ databaseId, tableId }).filter(
        "=",
        dimension.column(),
        objectId,
      );

      return question.getUrl();
    },
  ];
}

function getFKTargetField(question, column) {
  const fkField = question.metadata().field(column.id);
  return fkField?.target;
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
  const targetField = getFKTargetField(question, column);
  if (!targetField) {
    return;
  }
  const [actionKey, action] = getActionForFKColumn({
    field: targetField,
    objectId,
  });

  actionObject[actionKey] = action;
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
