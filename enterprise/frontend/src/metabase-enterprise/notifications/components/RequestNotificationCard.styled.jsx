import styled from "styled-components";
import { Link } from "react-router";
import { color } from "metabase/lib/colors";
import Card from "metabase/components/Card";

export const QuestionNameHeader = styled.span`
  font-size: 16px;
  font-weight: bold;
  margin-left: 0.5rem;
`;

export const CardLink = styled(Link)`
  max-width: 800px;
  width: 100%;

  &:hover ${QuestionNameHeader} {
    color: ${color("brand")};
  }
`;

export const HoverableCard = styled(Card)`
  padding: 1.5rem;
  transition: box-shadow 200ms;
`;

export const CardHeader = styled.div`
  display: flex;
  align-items: center;
  padding-bottom: 0.5rem;
`;
