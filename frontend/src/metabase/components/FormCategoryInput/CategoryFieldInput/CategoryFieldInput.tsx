import TippyPopover from "metabase/components/Popover/TippyPopover";

import type Field from "metabase-lib/metadata/Field";

import {
  OptionListContainer,
  StyledFieldValuesWidget,
  FieldValuesWidgetContainer,
} from "./CategoryFieldInput.styled";

interface DefaultTokenFieldLayoutProps {
  valuesList: string[];
  optionsList: string[];
  isFocused: boolean;
}

const DefaultTokenFieldLayout = ({
  valuesList,
  optionsList,
  isFocused,
}: DefaultTokenFieldLayoutProps) => (
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
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore, typescript is very confused about the value type for this non-tsx component
        value={[String(value ?? "")]}
        fields={[field]}
        onChange={(newVals: string[]) => onChange(newVals[0])}
        multi={false}
        autoFocus={false}
        alwaysShowOptions={false}
        disableSearch={false}
        forceTokenField
        layoutRenderer={DefaultTokenFieldLayout}
        valueRenderer={(val: string) => <span>{val}</span>}
        color="brand"
        maxWidth={null}
      />
    </FieldValuesWidgetContainer>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default CategoryFieldInput;
