import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

export const RowCountButton = styled.button<{ highlighted?: boolean }>`
  color: ${props =>
    props.highlighted ? color("brand") : color("text-medium")};
  font-weight: bold;
  cursor: pointer;

  &:hover {
    color: ${color("brand")};
  }
`;

export const RowCountStaticLabel = styled.span`
  color: ${color("text-medium")};
`;
