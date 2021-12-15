import React, { useCallback, useMemo } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import AccordionList from "metabase/components/AccordionList";
import SelectButton from "metabase/components/SelectButton";

import { isCurrency, isFK } from "metabase/lib/schema_metadata";
import { useToggle } from "metabase/hooks/use-toggle";

import CurrencyPicker from "./CurrencyPicker";
import FKTargetPicker from "./FKTargetPicker";
import {
  CloseButton,
  SearchSectionContainer,
  ExtraSelectContainer,
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
  IDFields: PropTypes.array.isRequired, // list of PK / FK fields in dataset DB
};

function SemanticTypePicker({ field, sections, IDFields }) {
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

  const renderExtraSelect = useCallback(() => {
    const pseudoField = { semantic_type: field.value };

    if (isFK(pseudoField)) {
      return (
        <ExtraSelectContainer>
          <FKTargetPicker
            field={field}
            onChange={() => {}}
            IDFields={IDFields}
          />
        </ExtraSelectContainer>
      );
    }

    if (isCurrency(pseudoField)) {
      return (
        <ExtraSelectContainer>
          <CurrencyPicker field={field} onChange={() => {}} />
        </ExtraSelectContainer>
      );
    }

    return null;
  }, [field, IDFields]);

  if (isPickerOpen) {
    return (
      <React.Fragment>
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
          hideEmptySectionsInSearch
          renderSearchSection={renderSearchSection}
          maxHeight={350}
        />
        {renderExtraSelect()}
      </React.Fragment>
    );
  }

  return (
    <React.Fragment>
      <SelectButton
        className="cursor-pointer"
        hasValue={!!field.value}
        onClick={openPicker}
      >
        {pickerLabel}
      </SelectButton>
      {renderExtraSelect()}
    </React.Fragment>
  );
}

SemanticTypePicker.propTypes = propTypes;

export default SemanticTypePicker;
