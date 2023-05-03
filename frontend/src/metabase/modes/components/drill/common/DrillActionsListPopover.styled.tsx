import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon/Icon";
import Button from "metabase/core/components/Button";
import BreakoutPopover from "metabase/query_builder/components/BreakoutPopover";

export const Container = styled.div`
  min-width: 256px;

  padding: 1.5rem 1rem 1.5rem;
`;
export const Title = styled.p`
  font-weight: 700;
  font-size: 0.75rem;
  line-height: 1rem;
  color: ${color("text-light")};

  margin: 0 0 1rem 0.5rem;
`;
export const ContentWrapper = styled.div`
  display: flex;
  flex-direction: column;

  gap: 0.5rem;
`;

export const ActionIcon = styled(Icon)`
  margin-right: 0.25rem;

  width: 0.875rem;
  height: 0.875rem;

  color: ${color("brand")};
  transition: all 200ms linear;
`;

export const ClickActionButton = styled(Button)`
  display: flex;
  flex: auto;
  align-items: center;

  border-radius: 8px;
  border: none;

  padding: 0.5rem;

  line-height: 1rem;

  &:hover {
    color: ${color("white")};
    background-color: ${color("brand")};

    ${ActionIcon} {
      color: ${color("white")};
    }
  }
`;

export const StyledBreakoutPopover = styled(BreakoutPopover)`
  color: ${color("brand")};
`;
