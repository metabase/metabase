import React, { useState } from "react";
import PropTypes from "prop-types";
import moment from "moment";
import { t } from "ttag";

import {
  Container,
  Footer,
  UpdateButton,
  PaddedSpecificDatePicker,
} from "./DateWidget.styled";

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
      <PaddedSpecificDatePicker
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
