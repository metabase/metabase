import { useField } from "formik";
import type { HTMLAttributes } from "react";
import { useRef, useState } from "react";
import { t } from "ttag";

import { skipToken, useGetCardQuery } from "metabase/api";
import { FormField } from "metabase/common/components/FormField";
import {
  QuestionPickerModal,
  getQuestionPickerValue,
} from "metabase/common/components/Pickers/QuestionPicker";
import { useUniqueId } from "metabase/common/hooks/use-unique-id";
import { Button, Icon } from "metabase/ui";

export interface FormModelPickerProps extends HTMLAttributes<HTMLDivElement> {
  name: string;
  title?: string;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function FormModelPicker({
  className,
  style,
  name,
  title,
  placeholder = t`Select a model`,
}: FormModelPickerProps) {
  const id = useUniqueId();
  const [{ value }, { error, touched }, { setValue }] = useField(name);
  const formFieldRef = useRef<HTMLDivElement>(null);

  const isModelSelected = typeof value === "number";
  const { data: model } = useGetCardQuery(
    isModelSelected ? { id: value } : skipToken,
  );

  const [isPickerOpen, setIsPickerOpen] = useState(false);

  return (
    <>
      <FormField
        className={className}
        style={style}
        title={title}
        htmlFor={id}
        error={touched ? error : undefined}
        ref={formFieldRef}
      >
        <Button
          data-testid="collection-picker-button"
          id={id}
          onClick={() => setIsPickerOpen(true)}
          fullWidth
          rightSection={<Icon name="ellipsis" />}
          styles={{
            inner: {
              justifyContent: "space-between",
            },
            root: { "&:active": { transform: "none" } },
          }}
        >
          {isModelSelected ? model?.name : placeholder}
        </Button>
      </FormField>
      {isPickerOpen && (
        <QuestionPickerModal
          models={["dataset"]}
          title={t`Select a model`}
          value={model?.id ? getQuestionPickerValue(model) : undefined}
          onChange={(newModel) => {
            setValue(newModel.id);
            setIsPickerOpen(false);
          }}
          onClose={() => setIsPickerOpen(false)}
        />
      )}
    </>
  );
}
