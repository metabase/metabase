import styled from "@emotion/styled";

import Button from "metabase/core/components/Button";
import { alpha, color } from "metabase/lib/colors";
import { Icon, rem } from "metabase/ui";

export const ClickActionButtonIcon = styled(Icon)`
  margin-right: 0.2rem;
  color: ${color("brand")};
  transition: all 200ms linear;
`;

export const ClickActionButtonTextIcon = styled.span`
  margin-right: ${rem(4)};
  width: 0.875rem;
  text-align: center;
  font-weight: 700;
  font-size: 1.25rem;
  color: ${color("brand")};
  transition: all 200ms linear;
`;

export const Subtitle = styled.div`
  color: ${color("text-light")};
  font-weight: normal;
  margin-left: 1rem;
`;

export const TokenFilterActionButton = styled(Button)`
  color: ${color("brand")};
  font-size: 1.25rem;
  line-height: 1rem;
  padding: 0.125rem 0.85rem 0.25rem;
  border: 1px solid ${color("focus")};
  border-radius: 100px;

  &:hover {
    color: ${color("white")};
    background-color: ${color("brand")};
    border-color: ${color("brand")};
  }
`;

export const TokenActionButton = styled(Button)`
  color: ${color("brand")};
  font-size: 0.875em;
  line-height: 1rem;
  padding: 0.3125rem 0.875rem;
  border: 1px solid ${alpha("brand", 0.35)};
  border-radius: 100px;

  &:hover {
    color: ${color("white")};
    background-color: ${color("brand")};
    border-color: ${color("brand")};
  }
`;

export const SortControl = styled(Button)`
  color: ${color("brand")};
  border: 1px solid ${alpha("brand", 0.35)};
  line-height: 1;

  font-size: 0.75rem;

  padding: 0.1875rem 0.875rem 0.0625rem;
  border-radius: 100px;

  &:hover {
    color: ${color("white")};
    background-color: ${color("brand")};
    border-color: ${color("brand")};
  }
`;

export const FormattingControl = styled(Button)`
  color: ${alpha("text-light", 0.65)};
  margin-left: auto;
  line-height: 1;

  border: none;
  padding: 0.125rem 0.25rem;

  &:hover {
    color: ${color("brand")};
    background-color: transparent;
  }
`;

export const InfoControl = styled.div`
  color: ${color("text-dark")};
  font-weight: bold;
  line-height: 1.5rem;
  max-width: 10.75rem;
`;
