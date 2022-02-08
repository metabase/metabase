import styled from "styled-components";
import Link from "metabase/core/components/Link";
import Icon from "metabase/components/Icon";
import { color } from "metabase/lib/colors";

export const ModalBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  padding: 0 2rem 2rem;
`;

export const CardRoot = styled(Link)`
  display: flex;
  padding: 1.75rem;
  align-items: center;
  border: 1px solid ${color("border")};
  border-radius: 6px;

  &:hover {
    border-color: ${color("brand")};
  }
`;

export const CardIcon = styled(Icon)`
  color: ${color("bg-medium")};
  width: 1.375rem;
  height: 1.375rem;
  margin-right: 1.75rem;

  ${CardRoot}:hover & {
    color: ${color("brand")};
  }
`;

export const CardBody = styled.span`
  display: block;
`;

export const CardTitle = styled.span`
  display: block;
  color: ${color("text-dark")};
  font-weight: bold;
  margin-bottom: 0.125rem;

  ${CardRoot}:hover & {
    color: ${color("brand")};
  }
`;

export const CardDescription = styled.span`
  display: block;
  color: ${color("text-dark")};
`;
