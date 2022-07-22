import React, { useCallback, useMemo } from "react";
import { t } from "ttag";

import validate from "metabase/lib/validate";
import { TYPE } from "metabase/lib/types";

import Field from "metabase-lib/lib/metadata/Field";
import Table from "metabase-lib/lib/metadata/Table";

import { StyledForm } from "../components/WritebackForm.styled";

import { isEditableField } from "../utils";
import CategoryFieldPicker from "./CategoryFieldPicker";

export interface WritebackFormProps {
  table: Table;
  row?: unknown[];
  type?: "insert" | "update";
  mode?: "row" | "bulk";
  onSubmit: (values: Record<string, unknown>) => void;

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
  if (field.isCategory() && field.semantic_type !== TYPE.Name) {
    return {
      fieldInstance: field,
      widget: CategoryFieldPicker,
    };
  }
  return { type: "input" };
}

function getFieldValidationProp(field: Field) {
  let validator = validate as any;

  if (field.database_required) {
    validator = validator.required();
  }

  return {
    validate: validator,
  };
}

function WritebackForm({
  table,
  row,
  type = row ? "update" : "insert",
  mode,
  onSubmit,
  ...props
}: WritebackFormProps) {
  const editableFields = useMemo(() => {
    const fields = table.fields.filter(isEditableField);
    if (mode === "bulk") {
      // Ideally we need to filter out fields with 'unique' constraint
      return fields.filter(field => !field.isPK());
    }
    return fields;
  }, [table, mode]);

  const form = useMemo(() => {
    return {
      fields: editableFields.map(field => {
        const fieldIndex = table.fields.findIndex(f => f.id === field.id);
        const initialValue = row ? row[fieldIndex] : undefined;

        let title = field.displayName();
        if (field.database_required) {
          title += " (" + t`required` + ")";
        }

        return {
          name: field.name,
          title,
          description: field.description,
          initial: initialValue,
          ...getFieldTypeProps(field),
          ...getFieldValidationProp(field),
        };
      }),
    };
  }, [table, row, editableFields]);

  const handleSubmit = useCallback(
    values => {
      const isUpdate = type === "update";
      const changes = isUpdate ? {} : values;

      if (isUpdate) {
        const fields = form.fields;

        // makes sure we only pass fields that were actually changed
        Object.keys(values).forEach(fieldName => {
          const field = fields.find(field => field.name === fieldName);
          const hasChanged = !field || field.initial !== values[fieldName];
          if (hasChanged) {
            changes[fieldName] = values[fieldName];
          }
        });
      }

      return onSubmit?.(changes);
    },
    [form, type, onSubmit],
  );

  const submitTitle = type === "update" ? t`Update` : t`Create`;

  return (
    <StyledForm
      {...props}
      form={form}
      onSubmit={handleSubmit}
      submitTitle={submitTitle}
    />
  );
}

export default WritebackForm;
