import React, {
  useCallback,
  useEffect,
  useState,
  useRef,
  HTMLAttributes,
} from "react";
import { t } from "ttag";
import { useField } from "formik";

import { useUniqueId } from "metabase/hooks/use-unique-id";
import { FormField } from "metabase/core/components/FormField";
import { SelectButton } from "metabase/core/components/SelectButton";
import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import { useQuestionQuery } from "metabase/common/hooks";
import type { CardId } from "metabase-types/api";

import { PopoverItemPicker, MIN_POPOVER_WIDTH } from "./FormModelPicker.styled";

export interface FormModelPickerProps extends HTMLAttributes<HTMLDivElement> {
  name: string;
  title?: string;
  placeholder?: string;
}

const ITEM_PICKER_MODELS = ["dataset"];

function FormModelPicker({
  className,
  style,
  name,
  title,
  placeholder = t`Select a model`,
}: FormModelPickerProps) {
  const id = useUniqueId();
  const [{ value }, { error, touched }, { setValue }] = useField(name);
  const formFieldRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(MIN_POPOVER_WIDTH);
  const isModelSelected = typeof value === "number";
  const { data: model } = useQuestionQuery({
    id: value,
    enabled: isModelSelected,
  });

  useEffect(() => {
    const { width: formFieldWidth } =
      formFieldRef.current?.getBoundingClientRect() || {};
    if (formFieldWidth) {
      setWidth(formFieldWidth);
    }
  }, []);

  const renderTrigger = useCallback(
    ({ onClick: handleShowPopover }) => (
      <FormField
        className={className}
        style={style}
        title={title}
        htmlFor={id}
        error={touched ? error : undefined}
        ref={formFieldRef}
      >
        <SelectButton onClick={handleShowPopover}>
          {isModelSelected ? model?.displayName() : placeholder}
        </SelectButton>
      </FormField>
    ),
    [
      id,
      title,
      placeholder,
      error,
      touched,
      className,
      style,
      model,
      isModelSelected,
    ],
  );

  const renderContent = useCallback(
    ({ closePopover }) => {
      return (
        <PopoverItemPicker
          value={{ id: value, model: "dataset" }}
          models={ITEM_PICKER_MODELS}
          onChange={({ id }: { id: CardId }) => {
            setValue(id);
            closePopover();
          }}
          showSearch
          width={width}
        />
      );
    },
    [value, width, setValue],
  );

  return (
    <TippyPopoverWithTrigger
      placement="bottom-start"
      renderTrigger={renderTrigger}
      popoverContent={renderContent}
      maxWidth={width}
    />
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default FormModelPicker;
