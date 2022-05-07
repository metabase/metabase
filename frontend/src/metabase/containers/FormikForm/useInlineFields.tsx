import { useCallback, useState } from "react";
import _ from "underscore";
import { FieldName, FormFieldDefinition } from "metabase-types/forms";

type FieldsMap = Record<FieldName, FormFieldDefinition>;

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

export default useInlineFields;
