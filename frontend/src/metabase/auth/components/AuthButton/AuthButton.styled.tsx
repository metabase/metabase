import styled from "styled-components";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";
import Link from "metabase/components/Link";

export const TextRoot = styled.div`
  text-align: center;
`;

export const TextLink = styled(Link)`
  color: ${color("text-dark")};

  &:hover {
    color: ${color("brand")};
  }
`;

export const CardLink = styled(TextLink)`
  display: flex;
  justify-content: center;
  align-items: center;
  height: 3.5rem;
  background-color: ${color("white")};
  box-shadow: 0 3px 10px ${color("shadow")};
  border-radius: 6px;
`;

export const CardIcon = styled(Icon)`
  margin-right: 0.5rem;
`;

export const CardText = styled.span`
  font-weight: 700;
`;
