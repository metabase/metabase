import React from "react";

import ModelPicker from "metabase/containers/ModelPicker";
import ItemSelect from "metabase/containers/ItemSelect";

import Question from "metabase/entities/questions";

import type { Card } from "metabase-types/api";
import type { FormField } from "metabase-types/forms";

const ModelSelect = ItemSelect(
  ModelPicker,
  ({ id }: { id: Card["id"] }) => <Question.Name id={id} />,
  "dataset",
);

function FormModelWidget({ field }: { field: FormField<string, Card["id"]> }) {
  return <ModelSelect {...field} />;
}

export default FormModelWidget;
