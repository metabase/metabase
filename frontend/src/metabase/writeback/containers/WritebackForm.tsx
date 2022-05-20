import React, { useCallback, useMemo } from "react";
import { t } from "ttag";

import Form from "metabase/containers/Form";

import { TYPE } from "metabase/lib/types";

import Field from "metabase-lib/lib/metadata/Field";
import Table from "metabase-lib/lib/metadata/Table";

import CategoryFieldPicker from "./CategoryFieldPicker";

export interface WritebackFormProps {
  table: Table;
  row?: unknown[];
  onSubmit?: (values: { [key: string]: number | string }) => void;

  // Form props
  isModal?: boolean;
}

function getFieldTypeProps(field: Field) {
  if (field.isFK()) {
    return {
      type: field.isNumeric() ? "integer" : "input",
    };
  }
  if (field.isNumeric()) {
    return { type: "integer" };
  }
  if (field.isBoolean()) {
    return { type: "boolean" };
  }
  if (field.isDate()) {
    return { type: "date" };
  }
  if (field.semantic_type === TYPE.Email) {
    return { type: "email" };
  }
  if (
    field.semantic_type === TYPE.Description ||
    field.semantic_type === TYPE.Comment
  ) {
    return { type: "text" };
  }
  if (field.semantic_type === TYPE.Title) {
    return { type: "input" };
  }
  if (field.isCategory()) {
    return {
      fieldInstance: field,
      widget: CategoryFieldPicker,
    };
  }
  return { type: "input" };
}

function WritebackForm({ table, row, onSubmit, ...props }: WritebackFormProps) {
  const editableFields = useMemo(
    () => table.fields.filter(field => field.id && !field.isPK()),
    [table],
  );

  const form = useMemo(() => {
    return {
      fields: editableFields.map(field => {
        const fieldIndex = table.fields.findIndex(f => f.id === field.id);
        const initialValue = row ? row[fieldIndex] : undefined;
        return {
          name: field.name,
          title: field.displayName(),
          description: field.description,
          initial: initialValue,
          ...getFieldTypeProps(field),
        };
      }),
    };
  }, [table, row, editableFields]);

  const handleSubmit = useCallback(
    values => {
      onSubmit?.(values);
    },
    [onSubmit],
  );

  const submitTitle = row ? t`Update` : t`Create`;

  return (
    <Form
      {...props}
      form={form}
      onSubmit={handleSubmit}
      submitTitle={submitTitle}
    />
  );
}

export default WritebackForm;
