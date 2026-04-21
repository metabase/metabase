import { useFormikContext } from "formik";
import {
  type PropsWithChildren,
  createContext,
  useEffect,
  useState,
} from "react";

import type { DatabaseData } from "metabase-types/api";

import { checkFormIsDirty } from "./utils";

export const FormDirtyStateContext = createContext<boolean>(false);

type ProviderProps = PropsWithChildren<{
  onDirtyStateChange?: (isDirty: boolean) => void;
}>;

/**
 * Custom definition for form dirty state.
 * This is needed because Formik's `dirty` value is not accurate to track actual field updates on our database form (#65988).
 *
 * This should be wrapped in a FormProvider.
 */
export const FormDirtyStateProvider = ({
  children,
  onDirtyStateChange,
}: ProviderProps) => {
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const { initialValues, values } = useFormikContext<DatabaseData>();

  useEffect(() => {
    setIsDirty(checkFormIsDirty(initialValues, values));
  }, [initialValues, values]);

  useEffect(() => {
    onDirtyStateChange?.(isDirty);
  }, [isDirty, onDirtyStateChange]);

  return (
    <FormDirtyStateContext.Provider value={isDirty}>
      {children}
    </FormDirtyStateContext.Provider>
  );
};
