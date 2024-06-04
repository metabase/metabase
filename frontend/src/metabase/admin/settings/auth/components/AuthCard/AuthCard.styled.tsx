import styled from "@emotion/styled";

import EntityMenu from "metabase/components/EntityMenu";
import { color } from "metabase/lib/colors";

export const CardRoot = styled.div`
  flex: 1;
  max-width: 52rem;
  border-bottom: 1px solid var(--mb-color-border);
  padding-bottom: 2rem;
`;

export const CardHeader = styled.div`
  display: flex;
  align-items: flex-end;
  gap: 1rem;
  margin-bottom: 0.25rem;
`;

export const CardTitle = styled.div`
  color: ${color("text-dark")};
  font-size: 1.5rem;
  font-weight: bold;
`;

export const CardDescription = styled.div`
  color: ${color("text-dark")};
  font-size: 0.875rem;
  line-height: 1.5rem;
  margin-bottom: 1rem;
  max-width: 40rem;
`;

interface CardBadgeProps {
  isEnabled: boolean;
}

export const CardBadge = styled.div<CardBadgeProps>`
  color: ${props =>
    props.isEnabled ? "var(--mb-color-brand)" : color("danger")};
  background-color: ${props =>
    props.isEnabled ? color("brand-lighter") : "var(--mb-color-bg-light)"};
  padding: 0.25rem 0.375rem;
  border-radius: 0.25rem;
  font-weight: bold;
`;

export const CardMenu = styled(EntityMenu)`
  margin-left: auto;
`;
