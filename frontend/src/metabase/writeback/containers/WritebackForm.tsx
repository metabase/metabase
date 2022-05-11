import React, { useCallback, useMemo } from "react";

import Form from "metabase/containers/Form";

import { TYPE } from "metabase/lib/types";

import Field from "metabase-lib/lib/metadata/Field";
import Table from "metabase-lib/lib/metadata/Table";

import CategoryFieldPicker from "./CategoryFieldPicker";

export interface WritebackFormProps {
  table: Table;
  onSubmit?: () => void;
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

function WritebackForm({ table, onSubmit }: WritebackFormProps) {
  const editableFields = useMemo(
    () => table.fields.filter(field => !field.isPK()),
    [table],
  );

  const form = useMemo(
    () => ({
      fields: editableFields.map(field => ({
        name: field.name,
        title: field.displayName(),
        description: field.description,
        ...getFieldTypeProps(field),
      })),
    }),
    [editableFields],
  );

  const handleSubmit = useCallback(() => {
    onSubmit?.();
  }, [onSubmit]);

  return <Form form={form} onSubmit={handleSubmit} />;
}

export default WritebackForm;
