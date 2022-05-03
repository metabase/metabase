import React from "react";
import _ from "underscore";
import { FormLegacyContext, LegacyContextTypes } from "./types";

type Props = {
  children: React.ReactNode;
};

function Form({
  children,
  handleSubmit,
  className,
  style,
}: Props & FormLegacyContext) {
  return (
    <form onSubmit={handleSubmit} className={className} style={style}>
      {children}
    </form>
  );
}

const FormUsingLegacyContext = (props: Props, context: FormLegacyContext) => (
  <Form {...props} {...context} />
);

FormUsingLegacyContext.contextTypes = _.pick(
  LegacyContextTypes,
  "handleSubmit",
  "className",
  "style",
);

export default FormUsingLegacyContext;
