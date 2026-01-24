import { useField } from "formik";
import { useEffect, useRef } from "react";
import { t } from "ttag";

import { FormTextInput } from "metabase/forms";
import { slugify } from "metabase/lib/formatting/url";

export const TargetNameInput = () => {
  const isDirtyRef = useRef(false);

  const [{ value: name }] = useField<string>("name");
  const [, , { setValue: setTargetName }] = useField<string>("targetName");

  useEffect(() => {
    if (!isDirtyRef.current) {
      const slugified = slugify(name);
      setTargetName(slugified);
    }
  }, [name, setTargetName]);

  const handleTargetNameChange = () => {
    isDirtyRef.current = true;
  };

  return (
    <FormTextInput
      name="targetName"
      label={t`Table name`}
      placeholder={t`descriptive_name`}
      onChange={handleTargetNameChange}
    />
  );
};
