import styled from "@emotion/styled";
import type { HTMLAttributes } from "react";
import Card from "metabase/components/Card";
import IconButtonWrapper from "metabase/components/IconButtonWrapper";
import { Ellipsified } from "metabase/core/components/Ellipsified";
import Link from "metabase/core/components/Link";
import { color } from "metabase/lib/colors";
import { Button, Collapse, Flex, Icon, type ButtonProps } from "metabase/ui";
import { BrowseGrid } from "./BrowseApp.styled";

export const ModelCard = styled(Card)`
  padding: 1.5rem;
  padding-bottom: 1rem;
  margin: 0.5rem 0;

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

  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;

  // Without the following rule, the useIsTruncated hook,
  // which Ellipsified calls, might think that this element
  // is truncated when it is not
  padding-bottom: 1px;
`;

export const ModelGrid = styled(BrowseGrid)``;

export const CollectionHeaderContainer = styled(Flex)`
  grid-column: 1 / -1;
  margin-left: -2.25rem;
  display: flex;
  align-items: center;
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
  margin-left: auto;
`;

export const CollectionCollapse = styled(Collapse)`
  display: contents;
`;

export const ContainerExpandCollapseButton = styled(Button)<
  ButtonProps & HTMLAttributes<HTMLButtonElement>
>`
  border: 0;
  background-color: inherit;
`;

export const CollectionExpandCollapseContainer = styled(Flex)`
  display: flex;
  gap: 0.25rem;
  justify-content: flex-start;
  align-items: center;
  grid-column: 1 / -1;
  margin: 0.5rem 0;
`;

export const CollectionHeaderToggle = styled(Button)<
  ButtonProps & HTMLAttributes<HTMLButtonElement>
>`
  padding: 10px;
  position: relative;
  top: 6px;
  margin-top: 0.5rem;
  border: none;
  background-color: transparent;
  overflow: unset;
  &:hover div {
    color: ${color("brand")};
  }
`;

export const CollectionSummary = styled.div`
  margin-left: auto;
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
  margin-right: 0.5rem;
`;

export const CollectionHeader = styled.div<{ index: number }>`
  display: flex;
  width: 100%;
  padding-top: 1rem;
  ${({ index }) => index > 0 && `border-top: 1px solid ${color("border")};`}
`;
