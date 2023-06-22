import styled from "@emotion/styled";
import { css } from "@emotion/react";
import { color } from "metabase/lib/colors";
import { Icon } from "metabase/core/components/Icon";

export const FieldRow = styled.div`
  display: flex;
  align-items: center;
  margin-bottom: 0.5em;
`;

export const Label = styled.label<{
  horizontal?: boolean;
  standAlone?: boolean;
}>`
  margin-bottom: 0;
  ${props =>
    props.horizontal &&
    css`
      margin-right: auto;
    `}
  ${props =>
    props.standAlone &&
    css`
      margin-top: 0.8em;
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

export const InfoLabel = styled.span`
  color: ${color("text-medium")};
  font-size: 0.88em;
  margin-left: auto;
  cursor: default;
`;

export const FieldContainer = styled.div<{
  horizontal?: boolean;
  align?: "left" | "right";
}>`
  width: 100%;
  margin-right: ${props => (props.horizontal ? "1rem" : "")};
  margin-left: ${props => (props.align === "left" ? "0.5rem" : "")};
`;

export const InputContainer = styled.div`
  flex-shrink: 0;
`;
