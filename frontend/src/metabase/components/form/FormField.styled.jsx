import styled from "@emotion/styled";
import { css } from "@emotion/react";
import Icon from "metabase/components/Icon";

import { color } from "metabase/lib/colors";

export const FieldRow = styled.div`
  display: flex;
  align-items: center;
  margin-bottom: 0.5em;
`;

export const Label = styled.label`
  margin-bottom: 0;
  ${props =>
    props.horizontal &&
    css`
      margin-right: auto;
    `}
`;

Label.defaultProps = { className: "Form-label" };

export const InfoIcon = styled(Icon)`
  margin-left: 8px;
  color: ${color("bg-dark")};

  &:hover {
    color: ${color("brand")};
  }
`;

InfoIcon.defaultProps = { name: "info", size: 12 };

export const FieldContainer = styled.div`
  margin-right: ${props => (props.horizontal ? "1rem" : "")};
`;

export const InputContainer = styled.div`
  flex-shrink: 0;
  ${props =>
    props.horizontal &&
    css`
      margin-left: auto;
    `}
`;
