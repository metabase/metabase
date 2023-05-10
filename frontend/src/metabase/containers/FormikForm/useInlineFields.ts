import { useCallback, useState } from "react";
import _ from "underscore";
import { FormFieldDefinition } from "metabase-types/forms";

type FieldsMap = Record<string, FormFieldDefinition>;

function useInlineFields() {
  const [inlineFields, setInlineFields] = useState<FieldsMap>({});

  const registerFormField = useCallback((field: FormFieldDefinition) => {
    setInlineFields(fields => ({ ...fields, [field.name]: field }));
  }, []);

  const unregisterFormField = useCallback((field: FormFieldDefinition) => {
    setInlineFields(fields => _.omit(fields, field.name));
  }, []);

  return {
    inlineFields,
    registerFormField,
    unregisterFormField,
  };
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default useInlineFields;
