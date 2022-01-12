import styled from "styled-components";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";
import ExternalLink from "metabase/components/ExternalLink";

export const CardRoot = styled(ExternalLink)`
  display: block;
  padding: 1.5rem;
  border-radius: 0.375rem;
  background-color: ${color("white")};
  box-shadow: 0 1px 6px ${color("shadow")};

  &:hover {
    background-color: ${color("bg-light")};
  }
`;

export const CardHeader = styled.span`
  display: flex;
  align-items: center;
  margin-bottom: 1rem;
`;

export const CardTitle = styled.span`
  flex: 1 1 auto;
  color: ${color("brand")};
  font-weight: bold;
  margin: 0 0.5rem;
`;

export const CardIcon = styled(Icon)`
  flex: 0 0 auto;
  color: ${color("brand")};
`;

export const CardBody = styled.span`
  color: ${color("text-medium")};
  line-height: 1.25rem;
`;
