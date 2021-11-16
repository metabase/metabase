import React from "react";
import PropTypes from "prop-types";
import styled from "styled-components";
import { t } from "ttag";

import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";
import Button from "metabase/components/Button";
import Radio from "metabase/components/Radio";

export const FilterRadio = styled(Radio).attrs({
  colorScheme: "accent7",
})`
  font-weight: 700;
`;

export const Container = styled.div`
  margin: 15px 20px 70px 20px;
`;

const ToggleButton = styled(Button).attrs({
  iconRight: "chevrondown",
  iconSize: 12,
})`
  margin-left: ${space(0)};
  color: ${color("text-medium")};
  border: none;
  background-color: transparent;

  &:hover {
    background-color: transparent;
  }

  .Icon {
    margin-top: 2px;
  }
`;

Toggle.propTypes = {
  onClick: PropTypes.func.isRequired,
};

export function Toggle({ onClick }) {
  return <ToggleButton onClick={onClick}>{t`More options`}</ToggleButton>;
}
