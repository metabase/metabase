import { Link } from "react-router";
import styled from "styled-components";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";

export const CollectionContent = styled.div`
  padding: 1rem;
  background-color: ${color("bg-medium")};
`;

export const EmptyStateRoot = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
`;

export const EmptyStateImage = styled.img`
  display: block;
  opacity: 0.5;
`;

export const EmptyStateTitle = styled.div`
  color: ${color("text-medium")};
  font-weight: 700;
`;

export const CollectionLink = styled(Link)`
  display: flex;
  justify-content: center;
  align-items: center;
  color: ${color("brand")};
  padding: 1rem;
`;

export const CollectionLinkText = styled.span`
  display: block;
  font-weight: 700;
`;

export const CollectionLinkIcon = styled(Icon)`
  display: block;
  width: 0.875rem;
  height: 0.875rem;
  margin-left: 0.5rem;
`;
