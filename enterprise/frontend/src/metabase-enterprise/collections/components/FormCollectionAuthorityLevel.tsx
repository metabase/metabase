import React, { HTMLAttributes } from "react";
import { useField } from "formik";
import { t } from "ttag";

import { useUniqueId } from "metabase/hooks/use-unique-id";

import { FormField } from "metabase/core/components/FormField";
import { SegmentedControl } from "metabase/components/SegmentedControl";

import { REGULAR_COLLECTION, OFFICIAL_COLLECTION } from "../constants";

interface Props extends HTMLAttributes<HTMLDivElement> {
  name: string;
  title?: string;
}

const OPTIONS = [
  {
    name: REGULAR_COLLECTION.name,
    value: REGULAR_COLLECTION.type,
    icon: REGULAR_COLLECTION.icon,
  },
  {
    name: OFFICIAL_COLLECTION.name,
    value: OFFICIAL_COLLECTION.type,
    icon: OFFICIAL_COLLECTION.icon,
    selectedColor: OFFICIAL_COLLECTION.color,
  },
];

export function FormCollectionAuthorityLevel({
  className,
  style,
  name = "authority_level",
  title = t`Collection type`,
}: Props) {
  const id = useUniqueId();
  const [{ value }, { error, touched }, { setValue }] = useField(name);

  return (
    <FormField
      className={className}
      style={style}
      title={title}
      htmlFor={id}
      infoTooltip={t`The contents of Official collections will get a badge by their name and will be more likely to show up in search results.`}
      error={touched ? error : undefined}
    >
      <SegmentedControl
        value={value}
        onChange={setValue}
        options={OPTIONS}
        variant="fill-background"
        inactiveColor="text-dark"
      />
    </FormField>
  );
}
