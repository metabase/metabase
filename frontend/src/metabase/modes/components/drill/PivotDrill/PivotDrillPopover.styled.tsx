import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon/Icon";
import Button from "metabase/core/components/Button";
import BreakoutPopover from "metabase/query_builder/components/BreakoutPopover";

export const Container = styled.div`
  min-width: 210px;

  padding: 1.5rem 1rem 1rem;
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

  &:hover {
    color: ${color("white")};
    background-color: ${color("brand")};

    ${ActionIcon} {
      color: ${color("white")};
    }
  }
`;

export const StyledBreakoutPopover = styled(BreakoutPopover)`
  .List-section-header-dimension {
    margin: 0 1.5rem 0.5rem;
    padding-top: 1.5rem;

    font-weight: 700;
    font-size: 0.75rem;
    line-height: 1rem;
    color: ${color("text-light")};

    text-transform: none;
    letter-spacing: normal;
  }

  .List-item {
    line-height: 1.065rem;
  }

  .List-item:not(.List-item--disabled):hover {
    //color: ${color("brand")};

    color: ${color("text-white")};
    background: ${color("brand")};
    border: none;
    border-radius: 8px;
  }

  .List-item--last {
    margin-bottom: 1rem;
  }
`;

export const RowItemWrapper = styled.div`
  margin: 0 0.5rem;

  // &:hover {
  //   color: ${color("text-white")};
  //   background: ${color("brand")};
  //   border-radius: 8px;
  //   cursor: pointer;
  // }
`;
