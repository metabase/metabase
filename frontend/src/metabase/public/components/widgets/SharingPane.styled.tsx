import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

export const IconContainer = styled.div`
  width: 100px;
  height: 63px;
  flex-shrink: 0;
  border: 1px solid ${color("border")};
  border-radius: 0.5rem;
  box-shadow: 0 2px 2px ${color("shadow")};
  display: grid;
  place-items: center;
`;

export const Header = styled.h3`
  font-size: 1.25rem;
`;

export const OptionHeader = styled.h4`
  font-size: 1.25rem;
  margin-bottom: ${space(1)};
`;

interface DescriptionProps {
  enableMouseEvents?: boolean;
}
export const Description = styled.p<DescriptionProps>`
  margin-top: 0;
  line-height: 1.5;
  ${({ enableMouseEvents }) => enableMouseEvents && "pointer-events: initial"};

  &:not(:last-of-type) {
    margin-bottom: ${space(2)};
  }
`;
