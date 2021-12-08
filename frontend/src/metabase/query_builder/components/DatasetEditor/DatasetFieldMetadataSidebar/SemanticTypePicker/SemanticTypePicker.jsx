import React, { useCallback, useMemo } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import AccordionList from "metabase/components/AccordionList";
import SelectButton from "metabase/components/SelectButton";

import { useToggle } from "metabase/hooks/use-toggle";

import FormFieldDivider from "../FormFieldDivider";
import {
  CloseButton,
  SearchSectionContainer,
} from "./SemanticTypePicker.styled";

const sectionItemShape = PropTypes.shape({
  name: PropTypes.string.isRequired,
  value: PropTypes.any,
  description: PropTypes.string,
});

const sectionShape = PropTypes.shape({
  name: PropTypes.string.isRequired,
  items: PropTypes.arrayOf(sectionItemShape).isRequired,
});

const propTypes = {
  field: PropTypes.shape({
    value: PropTypes.any,
    onChange: PropTypes.func.isRequired,
  }).isRequired,
  sections: PropTypes.arrayOf(sectionShape).isRequired,
};

function SemanticTypePicker({ field, sections }) {
  const [
    isPickerOpen,
    { turnOn: openPicker, turnOff: closePicker },
  ] = useToggle(false);

  const onChange = useCallback(
    item => {
      field.onChange(item.value);
      closePicker();
    },
    [field, closePicker],
  );

  const checkIsItemSelected = useCallback(item => item.value === field.value, [
    field,
  ]);

  const pickerLabel = useMemo(() => {
    const items = sections.flatMap(section => section.items);
    const item = items.find(item => item.value === field.value);
    return item?.name ?? t`None`;
  }, [field, sections]);

  const renderSearchSection = useCallback(
    searchInput => (
      <SearchSectionContainer>
        {searchInput}
        <CloseButton onClick={closePicker} />
      </SearchSectionContainer>
    ),
    [closePicker],
  );

  if (isPickerOpen) {
    return (
      <React.Fragment>
        <FormFieldDivider />
        <AccordionList
          className="MB-Select text-brand"
          sections={sections}
          alwaysExpanded
          itemIsSelected={checkIsItemSelected}
          onChange={onChange}
          searchable
          searchFuzzy={false}
          searchProp="name"
          searchPlaceholder={t`Search for a special type`}
          renderSearchSection={renderSearchSection}
        />
      </React.Fragment>
    );
  }

  return (
    <SelectButton
      className="cursor-pointer"
      hasValue={!!field.value}
      onClick={openPicker}
    >
      {pickerLabel}
    </SelectButton>
  );
}

SemanticTypePicker.propTypes = propTypes;

export default SemanticTypePicker;
