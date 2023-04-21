import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon/Icon";
import Button from "metabase/core/components/Button";

export const Container = styled.div`
  min-width: 210px;

  padding: 1rem 1rem 1rem;
`;
export const Title = styled.p`
  font-weight: 700;
  font-size: 0.75rem;
  line-height: 0.875rem;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: ${color("brand")};

  margin: 0 0 0.5rem 0.5rem;
`;
export const ContentWrapper = styled.div`
  display: flex;
  flex-direction: column;

  gap: 0.5rem;
`;

export const ActionIcon = styled(Icon)`
  margin-right: 0.75rem;

  color: ${color("brand")};
  transition: all 200ms linear;
`;

export const ClickActionButton = styled(Button)`
  display: flex;
  flex: auto;
  align-items: center;

  border-radius: 8px;
  border: none;

  &:hover {
    color: ${color("white")};
    background-color: ${color("brand")};

    ${ActionIcon} {
      color: ${color("white")};
    }
  }
`;
