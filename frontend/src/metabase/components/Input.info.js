import React from "react";
import Input from "metabase/components/Input";

export const component = Input;

export const description = `
  Gotta let folks enter information now dont't we
`;

export const examples = {
  Default: <Input />,
  Active: <Input active />,
  Error: <Input error />,
};
