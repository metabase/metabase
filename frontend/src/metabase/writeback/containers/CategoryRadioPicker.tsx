import React from "react";
import { connect } from "react-redux";

import Radio from "metabase/core/components/Radio";

import Fields from "metabase/entities/fields";
import { useOnMount } from "metabase/hooks/use-on-mount";

import { State } from "metabase-types/store";

import { CategoryWidgetProps as CategoryWidgetOwnProps } from "../types";

interface CategoryWidgetStateProps {
  fieldValues: unknown[][];
}

interface CategoryWidgetDispatchProps {
  fetchFieldValues: (opts: { id: number }) => void;
}

interface CategoryWidgetProps
  extends CategoryWidgetOwnProps,
    CategoryWidgetStateProps,
    CategoryWidgetDispatchProps {}

function mapStateToProps(
  state: State,
  { formField: { fieldInstance } }: CategoryWidgetOwnProps,
) {
  const fieldValues = Fields.selectors.getFieldValues(state, {
    entityId: fieldInstance.id,
  });
  return {
    fieldValues,
  };
}

const mapDispatchToProps = {
  fetchFieldValues: Fields.actions.fetchFieldValues,
};

function CategoryRadioPicker({
  field,
  formField,
  fieldValues = [],
  fetchFieldValues,
}: CategoryWidgetProps) {
  const { fieldInstance } = formField;

  useOnMount(() => {
    if (typeof fieldInstance.id === "number") {
      fetchFieldValues({ id: fieldInstance.id });
    }
  });

  const options = fieldValues.flat().map(value => ({
    name: String(value),
    value: String(value),
  }));

  return <Radio {...field} options={options} variant="bubble" />;
}

export default connect<
  CategoryWidgetStateProps,
  CategoryWidgetDispatchProps,
  CategoryWidgetOwnProps,
  State
>(
  mapStateToProps,
  mapDispatchToProps,
)(CategoryRadioPicker);
