import { t } from "ttag";

import EditableText from "metabase/common/components/EditableText/EditableText";

type BenchNameInputProps = {
  initialValue?: string;
  maxLength?: number;
  onChange?: (value: string) => void;
};

export function BenchNameInput({
  initialValue,
  maxLength,
  onChange,
}: BenchNameInputProps) {
  return (
    <EditableText
      initialValue={initialValue}
      maxLength={maxLength}
      placeholder={t`Name`}
      p="xs"
      ml="-xs"
      fw="bold"
      fz="h3"
      lh="h3"
      onChange={onChange}
    />
  );
}
