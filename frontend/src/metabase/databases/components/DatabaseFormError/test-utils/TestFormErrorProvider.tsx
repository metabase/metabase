import { Formik } from "formik";
import type { PropsWithChildren } from "react";

import { FormContext, type IFormContext } from "metabase/forms";

export type ErrorVariant = "hostAndPort" | "generic";

export interface FormProvidersOptions {
  errorVariant?: ErrorVariant;
  errorMessage?: string;
}

type Props = PropsWithChildren<FormProvidersOptions>;

/**
 * Used in tests to mock form errors
 */
export const TestFormErrorProvider = (props: Props) => {
  const { children, errorVariant, errorMessage } = props;
  const formState: IFormContext = {
    status: errorVariant ? "rejected" : "idle",
    setStatus: () => {},
    message: errorVariant ? errorMessage : undefined,
  };

  return (
    <Formik
      initialValues={{ value: {} }}
      onSubmit={() => {}}
      initialErrors={{
        details: {
          host:
            errorVariant === "hostAndPort"
              ? "Check your host settings"
              : undefined,
          port:
            errorVariant === "hostAndPort"
              ? "Check your port settings"
              : undefined,
        },
      }}
    >
      <FormContext.Provider value={formState}>{children}</FormContext.Provider>
    </Formik>
  );
};
