import React, { useState } from "react";
import PropTypes from "prop-types";
import moment from "moment";
import { t } from "ttag";

import SpecificDatePicker from "metabase/query_builder/components/filters/pickers/SpecificDatePicker";
import { Container, Footer, UpdateButton } from "./DateWidget.styled";

DateSingleWidget.propTypes = {
  value: PropTypes.any,
  setValue: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};

function DateSingleWidget({ value, setValue, onClose }) {
  const [internalValue, setInternalValue] = useState(value);
  const commitAndClose = () => {
    setValue(internalValue);
    onClose();
  };

  return (
    <Container>
      <SpecificDatePicker
        value={internalValue}
        onChange={setInternalValue}
        calendar
        hideTimeSelectors
      />
      <Footer>
        <UpdateButton onClick={commitAndClose}>{t`Update filter`}</UpdateButton>
      </Footer>
    </Container>
  );
}

DateSingleWidget.format = value =>
  value ? moment(value).format("MMMM D, YYYY") : "";

export default DateSingleWidget;
