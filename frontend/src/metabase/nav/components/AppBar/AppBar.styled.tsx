import { styled } from "metabase/ui/utils";

export const AppBarRoot = styled.header`
  position: relative;
  z-index: 4;

  @media print {
    display: none;
  }
`;
