import styled from "@emotion/styled";
import { space } from "metabase/styled-components/theme";

interface Props {
  enableMouseEvents?: boolean;
}

export const Header = styled.h3`
  font-size: 1.25rem;
`;

export const OptionHeader = styled.h4`
  font-size: 1.25rem;
  margin-bottom: ${space(1)};
`;

export const Description = styled.p<Props>`
  margin-top: 0;
  line-height: 1.5;
  ${({ enableMouseEvents }) => enableMouseEvents && "pointer-events: initial"};

  &:not(:last-of-type) {
    margin-bottom: ${space(2)};
  }
`;
