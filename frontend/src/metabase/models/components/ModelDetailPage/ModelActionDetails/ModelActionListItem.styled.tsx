import { css } from "@emotion/react";
import styled from "@emotion/styled";

import Button from "metabase/core/components/Button";
import Link from "metabase/core/components/Link";
import { color } from "metabase/lib/colors";
import { Icon } from "metabase/ui";

export const ActionHeader = styled.div`
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
`;

export const ActionTitle = styled(Link)`
  font-size: 1rem;
  font-weight: 700;
  color: var(--mb-color-text-dark);
  cursor: ${props => (props.to ? "pointer" : "unset")};

  &:hover {
    color: ${props => props.to && color("brand")};
  }
`;

export const ActionSubtitle = styled.span`
  display: block;
  font-size: 0.75rem;
  font-weight: 700;
  line-height: 0.875rem;
  color: var(--mb-color-text-medium);
  margin-top: 4px;
`;

export const ActionSubtitlePart = styled.span`
  &:not(:last-child)::after {
    content: "·";
    margin-left: 6px;
    margin-right: 6px;
  }
`;

export const MenuIcon = styled(Icon)`
  color: var(--mb-color-text-dark);
  cursor: pointer;

  &:hover {
    color: var(--mb-color-brand);
  }
`;

export const ActionCardContainer = styled.div`
  position: relative;
  margin-top: 0.75rem;
`;

const baseActionCardStyles = css`
  padding: 1rem;
  border-radius: 6px;
`;

export const CodeBlock = styled.pre`
  ${baseActionCardStyles}

  font-family: Monaco, monospace;
  font-size: 0.7rem;
  white-space: pre-wrap;
  margin: 0;

  color: var(--mb-color-text-white);
  background-color: var(--mb-color-text-dark);
`;

export const ActionRunButtonContainer = styled.div`
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
`;

export const ActionRunButton = styled(Button)`
  background-color: var(--mb-color-bg-white);
  color: var(--mb-color-text-dark);
`;

export const ImplicitActionCardContentRoot = styled.div`
  ${baseActionCardStyles};

  display: flex;
  align-items: center;

  color: var(--mb-color-text-medium);
  background-color: var(--mb-color-bg-medium);

  font-weight: 400;
`;
