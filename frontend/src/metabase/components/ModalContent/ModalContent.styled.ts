import styled from "@emotion/styled";
import Icon from "metabase/components/Icon";
import { color } from "metabase/lib/colors";

export const ActionsWrapper = styled.div`
  position: absolute;
  top: 0;
  right: 0;
  padding: 1.5rem;

  z-index: 2;

  display: flex;
  flex-direction: row;
  gap: 0.5rem;
`;

export const ActionIcon = styled(Icon)`
  color: ${color("text-light")};
  cursor: pointer;
  padding: 0.5rem;

  &:hover {
    color: ${color("text-medium")};
  }
`;
