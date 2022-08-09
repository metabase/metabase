import React from "react";
import { Field } from "formik";
import type { FieldProps } from "formik";
import PartialQueryBuilder from "../PartialQueryBuilder";

export interface FormQueryBuilderProps {
  name: string;
  features?: Record<string, boolean>;
  canChangeTable?: boolean;
  previewSummary?: string;
  updatePreviewSummary: (previewSummary: string) => void;
}

const FormQueryBuilder = ({
  name,
  features,
  canChangeTable,
  previewSummary,
  updatePreviewSummary,
}: FormQueryBuilderProps): JSX.Element => {
  return (
    <Field name={name}>
      {({ field }: FieldProps) => (
        <PartialQueryBuilder
          value={field.value}
          features={features}
          canChangeTable={canChangeTable}
          previewSummary={previewSummary}
          onChange={field.onChange}
          updatePreviewSummary={updatePreviewSummary}
        />
      )}
    </Field>
  );
};

export default FormQueryBuilder;
