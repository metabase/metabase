import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import EntityMenu from "metabase/components/EntityMenu";

export const CardRoot = styled.div`
  width: 31.25rem;
  padding: 2rem;
  border: 1px solid ${color("border")};
  border-radius: 0.5rem;
  box-shadow: 0 2px 2px ${color("shadow")};
  background-color: ${color("white")};
`;

export const CardHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
`;

export const CardTitle = styled.div`
  color: ${color("text-dark")};
  font-size: 1.5rem;
  line-height: 2rem;
  font-weight: bold;
`;

export const CardDescription = styled.div`
  color: ${color("text-dark")};
  font-size: 0.875rem;
  line-height: 1.5rem;
  margin-bottom: 1.5rem;
`;

interface CardBadgeProps {
  isEnabled: boolean;
}

export const CardBadge = styled.div<CardBadgeProps>`
  color: ${props => color(props.isEnabled ? "brand" : "danger")};
  background-color: ${props =>
    color(props.isEnabled ? "brand-lighter" : "bg-light")};
  padding: 0.25rem 0.375rem;
  border-radius: 0.25rem;
  font-weight: bold;
`;

export const CardMenu = styled(EntityMenu)`
  margin-left: auto;
`;
