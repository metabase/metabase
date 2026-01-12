import type * as Yup from "yup";

export type FunctionSchema = {
  input: Yup.ObjectSchema<any>[];
  output?: Yup.ObjectSchema<any>;
};
