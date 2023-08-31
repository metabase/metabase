import PropTypes from "prop-types";
import styled from "@emotion/styled";
import { t } from "ttag";

import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";
import Button from "metabase/core/components/Button";

export const RadioContainer = styled.div`
  margin: 15px 20px 70px 20px;
`;

export const CheckboxContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  font-weight: bold;
`;

const ToggleButton = styled(Button)`
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

ToggleButton.defaultProps = {
  iconRight: "chevrondown",
  iconSize: 12,
};

Toggle.propTypes = {
  onClick: PropTypes.func.isRequired,
};

export function Toggle({ onClick }: { onClick: () => void }) {
  return <ToggleButton onClick={onClick}>{t`More options`}</ToggleButton>;
}
