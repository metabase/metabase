import { isFK, isPK } from "metabase-lib/types/utils/isa";

export function objectDetailDrill({ question, clicked }) {
  const type = objectDetailDrillType({ question, clicked });
  if (!type) {
    return null;
  }

  return {
    type,
    objectId: clicked.value,
    hasManyPKColumns: hasManyPKColumns(question),
  };
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

function objectDetailDrillType({ question, clicked }) {
  if (!clicked) {
    return null;
  }

  const { column, value } = clicked;
  if (column == null || value === undefined || !question.query().isEditable()) {
    return null;
  }

  const { extraData } = clicked;
  if (isPK(column) && hasManyPKColumns(question)) {
    return "pk";
  } else if (isPK(column) && extraData?.dashboard != null) {
    return "dashboard";
  } else if (isPK(column)) {
    return "zoom";
  } else if (isFK(column)) {
    return "fk";
  } else {
    return null;
  }
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
