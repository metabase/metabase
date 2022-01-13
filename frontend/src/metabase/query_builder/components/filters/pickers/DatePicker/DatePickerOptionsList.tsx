import React from "react";

import {
  Container,
  OptionsGrouping,
  ItemButton,
  Divider,
} from "./DatePicker.styled";
import {
  PREDEFINED_RELATIVE_DAY_FILTER_OPTIONS,
  PREDEFINED_RELATIVE_MONTH_FILTER_OPTIONS,
  CUSTOM_FILTER_OPTIONS,
  PredefinedFilter,
} from "./constants";

type Props = {
  onPredefinedFilterClick: (id: PredefinedFilter) => void;
  onCustomFilterClick: (id: string) => void;
};

export function DatePickerOptionsList({
  onPredefinedFilterClick,
  onCustomFilterClick,
}: Props) {
  return (
    <Container>
      <ul>
        <OptionsGrouping>
          <ul>
            {PREDEFINED_RELATIVE_DAY_FILTER_OPTIONS.map(option => (
              <li key={option.id}>
                <ItemButton onClick={() => onPredefinedFilterClick(option.id)}>
                  {option.name}
                </ItemButton>
              </li>
            ))}
          </ul>
          <Divider />
        </OptionsGrouping>
        <OptionsGrouping>
          <ul>
            {PREDEFINED_RELATIVE_MONTH_FILTER_OPTIONS.map(option => (
              <li key={option.id}>
                <ItemButton onClick={() => onPredefinedFilterClick(option.id)}>
                  {option.name}
                </ItemButton>
              </li>
            ))}
          </ul>
          <Divider />
        </OptionsGrouping>
        <OptionsGrouping>
          <ul>
            {CUSTOM_FILTER_OPTIONS.map(option => (
              <li key={option.id}>
                <ItemButton onClick={() => onCustomFilterClick(option.id)}>
                  {option.name}
                </ItemButton>
              </li>
            ))}
          </ul>
        </OptionsGrouping>
      </ul>
    </Container>
  );
}
