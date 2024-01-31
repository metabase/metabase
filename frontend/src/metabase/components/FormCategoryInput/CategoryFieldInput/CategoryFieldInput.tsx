import TippyPopover from "metabase/components/Popover/TippyPopover";
import type { LayoutRendererArgs } from "metabase/components/TokenField/TokenField";

import type Field from "metabase-lib/metadata/Field";

import {
  OptionListContainer,
  StyledFieldValuesWidget,
  FieldValuesWidgetContainer,
} from "./CategoryFieldInput.styled";

const DefaultTokenFieldLayout = ({
  valuesList,
  optionsList,
  isFocused,
}: LayoutRendererArgs) => (
  <TippyPopover
    visible={isFocused && !!optionsList}
    content={<OptionListContainer>{optionsList}</OptionListContainer>}
    placement="bottom-start"
  >
    <div>{valuesList}</div>
  </TippyPopover>
);

interface CategoryFieldInputProps {
  value: string | number;
  field: Field;
  onChange: (newValue: string) => void;
}

function CategoryFieldInput({
  value,
  field,
  onChange,
}: CategoryFieldInputProps) {
  return (
    <FieldValuesWidgetContainer>
      <StyledFieldValuesWidget
        value={[String(value ?? "")]}
        fields={[field]}
        onChange={(newVals: string[]) => onChange(newVals[0])}
        multi={false}
        autoFocus={false}
        alwaysShowOptions={false}
        disableSearch={false}
        disableList
        layoutRenderer={DefaultTokenFieldLayout}
        valueRenderer={(val: string | number) => <span>{val}</span>}
        color="brand"
        maxWidth={null}
      />
    </FieldValuesWidgetContainer>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default CategoryFieldInput;
