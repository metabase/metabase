import { forwardRef, FunctionComponent, Ref } from "react";
import { t } from "ttag";

import FormInputWidget from "metabase/core/components/FormInput";
import FormTextAreaWidget from "metabase/core/components/FormTextArea";
import FormRadioWidget, {
  FormRadioProps,
} from "metabase/core/components/FormRadio";
import FormSelectWidget from "metabase/core/components/FormSelect";
import FormNumericInputWidget from "metabase/core/components/FormNumericInput";
import FormBooleanWidget from "metabase/core/components/FormToggle";
import CheckBox from "metabase/core/components/CheckBox";

import type { InputComponentType } from "metabase-types/api";
import type { ActionFormFieldProps } from "metabase/actions/types";

const VerticalRadio = (props: FormRadioProps) => (
  <FormRadioWidget {...props} vertical />
);

const WIDGETS: Record<InputComponentType, FunctionComponent<any>> = {
  text: FormInputWidget,
  date: FormInputWidget,
  time: FormInputWidget,
  "datetime-local": FormInputWidget,
  textarea: FormTextAreaWidget,
  number: FormNumericInputWidget,
  boolean: FormBooleanWidget,
  radio: VerticalRadio,
  select: FormSelectWidget,
};

interface FormWidgetProps {
  formField: ActionFormFieldProps;
  hidden?: boolean;
  onVisibilityChange?: ({ hidden }: { hidden: boolean }) => void;
}

export const ActionFormFieldWidget = forwardRef(function FormFieldWidget(
  { formField, hidden, onVisibilityChange }: FormWidgetProps,
  ref: Ref<any>,
) {
  const Widget =
    (formField.type ? WIDGETS[formField.type] : FormInputWidget) ??
    FormInputWidget;

  const actions =
    hidden !== undefined ? (
      <CheckBox
        onChange={() => {
          onVisibilityChange?.({ hidden: !hidden });
        }}
        checked={!hidden}
        label={t`Show field`}
      />
    ) : undefined;

  return (
    <Widget
      {...formField}
      disabled={hidden}
      actions={actions}
      nullable
      ref={ref}
    />
  );
});
