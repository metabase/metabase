import styled from "styled-components";
import { color, darken } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";
import { forwardRefToInnerRef } from "metabase/styled-components/utils";

interface SelectButtonRootProps {
  hasValue: boolean;
}

export const SelectButtonRoot = forwardRefToInnerRef(styled.button<
  SelectButtonRootProps
>`
  display: flex;
  width: 100%;
  align-items: center;
  padding: 0.6em;
  border: 1px solid ${color("border")};
  background-color: ${color("white")};
  border-radius: 8px;
  font-weight: 700;
  min-width: 104px;
  transition: all 200ms;
  color: ${props => (props.hasValue ? "inherit" : color("text-medium"))};

  &:focus,
  &:hover {
    border-color: ${darken("border", 0.15)};
  }

  // Backward compatibility
  .Form-field &:hover {
    border-color: ${color("brand")};
  }
`);

export const SelectButtonIcon = styled(Icon)`
  opacity: 0.75;
  display: flex;
  margin-left: auto;
`;

export const SelectButtonContent = styled.span`
  margin-right: 0.5rem;
`;
