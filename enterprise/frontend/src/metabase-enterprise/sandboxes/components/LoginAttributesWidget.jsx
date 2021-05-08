import React from "react";

import MappingEditor from "./MappingEditor";

type LoginAttributes = {
  [key: string]: string,
};

type FormField<T> = {
  value: T,
  onChange: (value: T) => void,
};

type Props = {
  field: FormField<?LoginAttributes>,
};

const LoginAttributesWidget = ({ field }: Props) => (
  <MappingEditor
    value={field.value || {}}
    onChange={field.onChange}
    addText="Add an attribute"
  />
);

export default LoginAttributesWidget;
