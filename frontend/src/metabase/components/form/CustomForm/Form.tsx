import React from "react";
import _ from "underscore";
import { CustomFormLegacyContext, LegacyContextTypes } from "./types";

type Props = {
  children: React.ReactNode;
};

function Form({
  children,
  handleSubmit,
  className,
  style,
}: Props & CustomFormLegacyContext) {
  return (
    <form onSubmit={handleSubmit} className={className} style={style}>
      {children}
    </form>
  );
}

const FormUsingLegacyContext = (
  props: Props,
  context: CustomFormLegacyContext,
) => <Form {...props} {...context} />;

FormUsingLegacyContext.contextTypes = _.pick(
  LegacyContextTypes,
  "handleSubmit",
  "className",
  "style",
);

export default FormUsingLegacyContext;
