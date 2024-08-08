import styled from "@emotion/styled";

import Card from "metabase/components/Card";
import Link from "metabase/core/components/Link";
import { MarkdownPreview } from "metabase/core/components/MarkdownPreview";
import { color } from "metabase/lib/colors";
import { Icon } from "metabase/ui";

export const ItemCard = styled(Card)``;

export const ItemLink = styled(Link)`
  display: block;
  height: min-content;
`;

export const ItemIcon = styled(Icon)`
  color: ${color("brand")};
  height: 1.5rem;
  width: 1.5rem;
`;

export const ActionsContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  visibility: hidden;
`;

export const Title = styled.div`
  font-weight: bold;
  font-size: 1rem;
  line-height: 1.5rem;
  color: ${color("text-dark")};
  transition: color 0.2s ease;
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
`;

export const Description = styled(MarkdownPreview)`
  color: ${color("text-medium")};
`;

export const Body = styled.div`
  padding: 1rem 1.5rem;
  display: flex;
  flex-direction: column;
  cursor: pointer;

  &:hover {
    ${Title} {
      color: ${color("brand")};
    }

    ${ActionsContainer} {
      visibility: visible;
    }
  }
`;

export const Header = styled.div`
  padding-bottom: 0.5rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
`;
