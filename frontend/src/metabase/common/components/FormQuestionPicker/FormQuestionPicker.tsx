import { useField } from "formik";
import type { HTMLAttributes } from "react";
import { useRef, useState } from "react";
import { t } from "ttag";

import { skipToken, useGetCardQuery } from "metabase/api";
import FormField from "metabase/common/components/FormField";
import {
  QuestionPickerModal,
  type QuestionPickerModel,
  getQuestionPickerValue,
} from "metabase/common/components/Pickers/QuestionPicker";
import { useUniqueId } from "metabase/common/hooks/use-unique-id";
import { Button, Icon } from "metabase/ui";

export interface FormQuestionPickerProps
  extends HTMLAttributes<HTMLDivElement> {
  className?: string;
  name: string;
  title?: string;
  placeholder?: string;
  pickerTitle?: string;
  pickerModels?: QuestionPickerModel[];
  style?: React.CSSProperties;
}

export function FormQuestionPicker({
  className,
  name,
  title,
  placeholder = t`Select a question`,
  pickerTitle = t`Select a question`,
  pickerModels = ["card"],
  style,
}: FormQuestionPickerProps) {
  const id = useUniqueId();
  const [{ value }, { error, touched }, { setValue }] = useField(name);
  const formFieldRef = useRef<HTMLDivElement>(null);

  const isCardSelected = typeof value === "number";
  const { data: card } = useGetCardQuery(
    isCardSelected ? { id: value } : skipToken,
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
          {isCardSelected ? card?.name : placeholder}
        </Button>
      </FormField>
      {isPickerOpen && (
        <QuestionPickerModal
          title={pickerTitle}
          models={pickerModels}
          value={card?.id ? getQuestionPickerValue(card) : undefined}
          onChange={(newCard) => {
            setValue(newCard.id);
            setIsPickerOpen(false);
          }}
          onClose={() => setIsPickerOpen(false)}
        />
      )}
    </>
  );
}
