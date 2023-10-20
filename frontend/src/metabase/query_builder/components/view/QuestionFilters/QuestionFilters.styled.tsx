import styled from "@emotion/styled";
import Button from "metabase/core/components/Button";
import { color, alpha } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

export const FilterHeaderContainer = styled.div`
  padding: ${space(1)} ${space(3)} 0 ${space(3)};
  border-bottom: 1px solid ${color("border")};
`;

export const FilterHeaderButton = styled(Button)<{ active: boolean }>`
  background-color: ${({ active }) =>
    active ? alpha(color("filter"), 0.8) : alpha(color("filter"), 0.2)};
  color: ${({ active }) => (active ? "white" : color("filter"))};
  border-radius: 99px;
  padding-top: ${space(0.5)};
  padding-bottom: ${space(0.5)};
  &:hover {
    background-color: ${color("filter")};
    color: white;
  }
  transition: background 300ms linear, border 300ms linear;

  @media (prefers-reduced-motion) {
    transition: none;
  }
`;
