import styled from "@emotion/styled";
import Link from "metabase/core/components/Link";
import Icon from "metabase/components/Icon";
import { color } from "metabase/lib/colors";

export const ListRoot = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  padding: 2rem;
`;

export const CardRoot = styled(Link)`
  display: flex;
  padding: 1.75rem;
  align-items: center;
  border: 1px solid ${color("border")};
  border-radius: 6px;
`;

export const CardIcon = styled(Icon)`
  color: ${color("text-light")};
  width: 1.375rem;
  height: 1.375rem;
  margin-right: 1.75rem;
`;

export const CardBody = styled.span`
  display: block;
  flex: 1 1 auto;
`;

export const CardTitle = styled.span`
  display: block;
  color: ${color("text-dark")};
  font-weight: bold;
  margin-bottom: 0.125rem;
`;

export const CardDescription = styled.span`
  display: block;
  color: ${color("text-dark")};
`;

export const CardInfo = styled.span`
  display: block;
  align-self: start;
  color: ${color("text-dark")};
  margin-left: 1.75rem;
`;

export const EmptyStateRoot = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 2rem;
`;

export const EmptyStateBody = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  max-width: 22.5rem;
`;

export const EmptyStateText = styled.div`
  color: ${color("text-dark")};
  line-height: 1.5rem;
  margin-bottom: 2rem;
`;
