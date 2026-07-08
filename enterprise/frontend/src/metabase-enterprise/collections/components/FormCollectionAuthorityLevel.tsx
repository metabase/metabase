import { useField } from "formik";
import type { HTMLAttributes } from "react";
import { t } from "ttag";

import { FormField } from "metabase/common/components/FormField";
import { useUniqueId } from "metabase/common/hooks/use-unique-id";
import { Center, Icon, SegmentedControl } from "metabase/ui";

import { OFFICIAL_COLLECTION, REGULAR_COLLECTION } from "../constants";

interface Props extends HTMLAttributes<HTMLDivElement> {
  name: string;
  title?: string;
}

const OPTIONS = [
  {
    label: REGULAR_COLLECTION.name,
    value: REGULAR_COLLECTION.type,
    icon: REGULAR_COLLECTION.icon,
  },
  {
    label: OFFICIAL_COLLECTION.name,
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

  const handleChange = (val: string) => {
    setValue(val === "null" ? null : val);
  };

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
        value={String(value)}
        onChange={handleChange}
        data={OPTIONS.map((option) => ({
          value: String(option.value),
          label: (
            <Center style={{ gap: 10 }} c={option.selectedColor}>
              <Icon name={option.icon} />
              {option.label}
            </Center>
          ),
        }))}
        variant="fill-background"
      />
    </FormField>
  );
}
