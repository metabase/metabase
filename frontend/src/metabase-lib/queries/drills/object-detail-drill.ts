import type { Field as ApiField } from "metabase-types/api";
import { DatasetColumn, RowValue } from "metabase-types/api";
import { isFK, isPK } from "metabase-lib/types/utils/isa";
import type Question from "metabase-lib/Question";
import type {
  ClickObject,
  DrillProps,
} from "metabase-lib/queries/drills/types";
import StructuredQuery from "metabase-lib/queries/StructuredQuery";
import type Field from "metabase-lib/metadata/Field";
import Metadata from "metabase-lib/metadata/Metadata";
import { isSameField } from "metabase-lib/queries/utils";

export type ObjectDetailDrillType = "pk" | "fk" | "zoom" | "dashboard";

export function objectDetailDrill({ question, clicked }: DrillProps) {
  if (!clicked || !clicked.column) {
    return null;
  }

  const drillValues = objectDetailDrillType({
    question,
    column: clicked.column,
    value: clicked.value,
    extraData: clicked.extraData,
    data: clicked.data,
  });

  if (!drillValues || !drillValues.type) {
    return null;
  }

  return {
    ...drillValues,
    hasManyPKColumns: hasManyPKColumns(question),
  };
}

export function objectDetailPKDrillQuestion({
  question,
  column,
  objectId,
}: {
  question: Question;
  column: DatasetColumn;
  objectId: RowValue;
}) {
  return question.filter("=", column, objectId);
}

export function objectDetailFKDrillQuestion({
  question,
  column,
  objectId,
}: {
  question: Question;
  column: DatasetColumn;
  objectId: RowValue;
}) {
  const targetField = getFKTargetField(column, question.metadata());
  if (targetField) {
    const newQuestion = question.drillPK(targetField, objectId);

    if (newQuestion) {
      return newQuestion;
    }
  }

  return question;
}

function objectDetailDrillType({
  question,
  column,
  value,
  extraData,
  data,
}: {
  question: Question;
  column: DatasetColumn;
  value: RowValue | undefined;
  extraData: ClickObject["extraData"];
  data?: ClickObject["data"];
}): {
  type: ObjectDetailDrillType;
  column: DatasetColumn;
  objectId: RowValue;
} | null {
  const query = question.query();

  if (column == null || !query.isEditable()) {
    return null;
  }

  if (isPK(column) && hasManyPKColumns(question) && value != null) {
    return {
      type: "pk",
      column,
      objectId: value,
    };
  } else if (isPK(column) && extraData?.dashboard != null && value != null) {
    return {
      type: "dashboard",
      column,
      objectId: value,
    };
  } else if (isPK(column) && value != null) {
    return {
      type: "zoom",
      column,
      objectId: value,
    };
  } else if (isFK(column) && value != null) {
    return {
      type: "fk",
      column,
      objectId: value,
    };
  } else {
    const isAggregated =
      query instanceof StructuredQuery && query.aggregations().length > 0;
    if (!isAggregated) {
      const pkColumn = data?.find(
        ({ col: item }) => isPK(item) && !isSameField(item, column),
      );

      if (pkColumn) {
        const { col: column, value } = pkColumn;

        return objectDetailDrillType({ question, column, value, extraData });
      }
    }

    return null;
  }
}

function getFKTargetField(column: DatasetColumn, metadata: Metadata) {
  const fkField = metadata.field(column.id);
  if (fkField?.target) {
    return fkField.target;
  }

  if (column.fk_target_field_id) {
    return metadata.field(column.fk_target_field_id);
  }

  return null;
}

function hasManyPKColumns(question: Question): boolean {
  let fields: (ApiField | Field)[] | undefined;

  if (question.isDataset()) {
    fields = question.getResultMetadata();
  }

  if (!fields) {
    const query = question.query() as StructuredQuery;

    fields = query.table?.()?.fields;
  }

  if (!fields) {
    fields = question.getResultMetadata();
  }

  if (fields) {
    return fields.filter(field => isPK(field)).length > 1;
  }

  return false;
}
