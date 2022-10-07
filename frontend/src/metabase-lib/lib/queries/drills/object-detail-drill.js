import { isPK, isFK } from "metabase-lib/lib/types/utils/isa";

export function objectDetailPKDrill({ question, clicked }) {
  if (!objectDetailDrill({ question, clicked })) {
    return false;
  }

  const { column } = clicked;
  return isPK(column) && hasManyPKColumns(question);
}

export function objectDetailDashboardDrill({ question, clicked }) {
  if (!objectDetailDrill({ question, clicked })) {
    return false;
  }

  const { column, extraData } = clicked;
  return isPK(column) && extraData != null && extraData.dashboard != null;
}

export function objectDetailZoomDrill({ question, clicked }) {
  if (!objectDetailDrill({ question, clicked })) {
    return false;
  }

  const { column } = clicked;
  return isPK(column);
}

export function objectDetailFKDrill({ question, clicked }) {
  if (!objectDetailDrill({ question, clicked })) {
    return false;
  }

  const { column } = clicked;
  return isFK(column);
}

export function objectDetailDrill({ question, clicked }) {
  return (
    clicked != null &&
    clicked.column != null &&
    clicked.value !== undefined &&
    question.query().isEditable()
  );
}

export function objectDetailPKDrillQuestion({ question, clicked }) {
  const { column, value: objectId } = clicked;
  return question.filter("=", column, objectId);
}

export function objectDetailFKDrillQuestion({ question, clicked }) {
  const { column, value: objectId } = clicked;
  const targetField = getFKTargetField(column, question.metadata());
  return question.drillPK(targetField, objectId);
}

function getFKTargetField(column, metadata) {
  const fkField = metadata.field(column.id);
  if (fkField?.target) {
    return fkField.target;
  }
  if (column.fk_target_field_id) {
    return metadata.field(column.fk_target_field_id);
  }
  return null;
}

function hasManyPKColumns(question) {
  const fields = question.isDataset()
    ? question.getResultMetadata() ?? question.query().table?.()?.fields
    : question.query().table?.()?.fields ?? question.getResultMetadata();

  return fields.filter(field => isPK(field)).length > 1;
}
