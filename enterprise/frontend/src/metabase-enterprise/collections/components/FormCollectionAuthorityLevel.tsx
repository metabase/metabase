import React from "react";
import { SegmentedControl } from "metabase/components/SegmentedControl/SegmentedControl";
import { FormFieldRoot } from "./FormCollectionAuthorityLevel.styled";

interface Props {
  field: any;
  options: any;
}

export function FormCollectionAuthorityLevel({ field, options }: Props) {
  return (
    <FormFieldRoot>
      <SegmentedControl
        value={field.value}
        onChange={field.onChange}
        options={options}
        variant="fill-background"
        inactiveColor="text-dark"
      />
    </FormFieldRoot>
  );
}
