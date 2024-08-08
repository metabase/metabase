import styled from "@emotion/styled";
import type { HTMLAttributes } from "react";

import Card from "metabase/components/Card";
import IconButtonWrapper from "metabase/components/IconButtonWrapper";
import { Ellipsified } from "metabase/core/components/Ellipsified";
import Link from "metabase/core/components/Link";
import { color } from "metabase/lib/colors";
import { Collapse, Icon, type ButtonProps, Box } from "metabase/ui";

import { BrowseGrid } from "./BrowseContainer.styled";

export const ModelCardLink = styled(Link)`
  margin: 0.5rem 0;
`;

export const ModelCard = styled(Card)`
  padding: 1.5rem;
  padding-bottom: 1rem;
  height: 9rem;
  display: flex;
  flex-flow: column nowrap;
  justify-content: flex-start;
  align-items: flex-start;
  border: 1px solid ${color("border")};
  box-shadow: none;

  &:hover {
    h1 {
      color: ${color("brand")};
    }
  }

  transition: box-shadow 0.15s;

  h1 {
    transition: color 0.15s;
  }
`;

export const MultilineEllipsified = styled(Ellipsified)`
  white-space: pre-line;
  overflow: hidden;
  text-overflow: ellipsis;
  width: 100%;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;

  /* Without the following rule, the useIsTruncated hook, which Ellipsified
   calls, might think that this element is truncated when it is not */
  padding-bottom: 1px;
`;

export const ModelGrid = styled(BrowseGrid)``;

export const CollectionHeaderContainer = styled.button`
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  border-top: 1px solid ${color("border")};
  margin-top: 0.75rem;
  cursor: pointer;
  color: ${color("text-dark")};

  &:hover {
    color: ${color("brand")};
  }

  :first-of-type {
    margin-top: 1rem;
    border-top: none;
  }
`;

export const CollectionHeaderLink = styled(Link)`
  display: flex;
  align-items: center;

  &:hover {
    color: ${color("brand")};
  }
`;

export const BannerCloseButton = styled(IconButtonWrapper)`
  color: ${color("text-light")};
  margin-inline-start: auto;
`;

export const CollectionCollapse = styled(Collapse)`
  display: contents;
`;

export const ContainerExpandCollapseButton = styled.div`
  border: 0;
  background-color: inherit;
`;

export const CollectionExpandCollapseContainer = styled(Box)<
  ButtonProps & HTMLAttributes<HTMLButtonElement>
>`
  display: flex;
  gap: 0.25rem;
  justify-content: flex-start;
  align-items: center;
  grid-column: 1 / -1;
  margin: 1rem 0.25rem;
`;

export const CollectionHeaderToggleContainer = styled.div`
  padding: 0.5rem;
  padding-inline-end: 0.75rem;
  position: relative;
  margin-inline-start: -2.25rem;
  margin-top: 0.75rem;
  border: none;
  background-color: transparent;
  overflow: unset;
  display: flex;

  &:hover {
    background-color: inherit;

    div,
    svg {
      color: ${color("brand")};
    }
  }
`;

export const CollectionSummary = styled.div`
  margin-inline-start: auto;
  white-space: nowrap;
  font-size: 0.75rem;
  color: ${color("text-medium")};
`;

export const FixedSizeIcon = styled(Icon)<{ size?: number }>`
  min-width: ${({ size }) => size ?? 16}px;
  min-height: ${({ size }) => size ?? 16}px;
`;

export const BannerModelIcon = styled(FixedSizeIcon)`
  color: ${color("text-dark")};
  margin-inline-end: 0.5rem;
`;

export const HoverUnderlineLink = styled(Link)`
  &:hover {
    text-decoration: underline;
  }
`;
