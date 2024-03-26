import { useField } from "formik";
import type { HTMLAttributes } from "react";
import { useState, useRef } from "react";
import { t } from "ttag";

import { QuestionPickerModal } from "metabase/common/components/QuestionPicker";
import { useQuestionQuery } from "metabase/common/hooks";
import FormField from "metabase/core/components/FormField";
import { useUniqueId } from "metabase/hooks/use-unique-id";
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
  const { data: model } = useQuestionQuery({
    id: value,
    enabled: isModelSelected,
  });

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
          rightIcon={<Icon name="ellipsis" />}
          styles={{
            inner: {
              justifyContent: "space-between",
            },
            root: { "&:active": { transform: "none" } },
          }}
        >
          {isModelSelected ? model?.displayName() : placeholder}
        </Button>
      </FormField>
      {isPickerOpen && (
        <QuestionPickerModal
          models={["dataset"]}
          title={t`Select a model`}
          value={
            model?.id()
              ? {
                  id: model?.id(),
                  model: model?.type() === "model" ? "dataset" : "card",
                }
              : undefined
          }
          onChange={newModel => {
            setValue(newModel.id);
            setIsPickerOpen(false);
          }}
          onClose={() => setIsPickerOpen(false)}
        />
      )}
    </>
  );
}
