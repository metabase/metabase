import styled from "@emotion/styled";
import Button from "metabase/core/components/Button";
import { color } from "metabase/lib/colors";

export const TypeSidebarButton = styled(Button)<{ isActive: boolean }>`
  color: ${props => (props.isActive ? color("brand") : color("text-medium"))};
  border: none;
  padding: 0 0 1.5rem 0;
`;
