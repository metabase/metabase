import React from "react";
import { connect } from "react-redux";
import { useMount } from "react-use";

import Radio from "metabase/core/components/Radio";
import Fields from "metabase/entities/fields";

import { State } from "metabase-types/store";

import { CategoryWidgetProps as CategoryWidgetOwnProps } from "./types";

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

function mapStateToProps(state: State, { field }: CategoryWidgetOwnProps) {
  const fieldValues = Fields.selectors.getFieldValues(state, {
    entityId: field.id,
  });
  return {
    fieldValues,
  };
}

const mapDispatchToProps = {
  fetchFieldValues: Fields.actions.fetchFieldValues,
};

function CategoryRadioPicker({
  value,
  onChange,
  field,
  fieldValues = [],
  fetchFieldValues,
}: CategoryWidgetProps) {
  useMount(() => {
    if (typeof field.id === "number") {
      fetchFieldValues({ id: field.id });
    }
  });

  const options = fieldValues.flat().map(value => ({
    name: String(value),
    value: String(value),
  }));

  return (
    <Radio
      value={value}
      onChange={onChange}
      options={options}
      variant="bubble"
    />
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect<
  CategoryWidgetStateProps,
  CategoryWidgetDispatchProps,
  CategoryWidgetOwnProps,
  State
>(
  mapStateToProps,
  mapDispatchToProps,
)(CategoryRadioPicker);
