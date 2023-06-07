import styled from "@emotion/styled";
import { alpha, color } from "metabase/lib/colors";
import Button from "metabase/core/components/Button";
import { Icon } from "metabase/core/components/Icon";

export const IconWrapper = styled.span`
  display: flex;
  margin-right: 0.25rem;

  color: ${color("brand")};

  transition: all 200ms linear;
`;

export const ClickActionButtonIcon = styled(Icon)`
  margin-right: 0.2rem;

  color: ${color("brand")};
  transition: all 200ms linear;
`;

export const HorizontalClickActionButton = styled(Button)`
  display: flex;
  flex: auto;
  align-items: center;

  border-radius: 8px;
  border: none;

  padding: 0.5rem;
  margin: 0 -0.5rem;
  width: auto;
  min-width: 148px;

  line-height: 1rem;

  &:hover {
    color: ${color("white")};
    background-color: ${color("brand")};

    ${ClickActionButtonIcon} {
      color: ${color("white")};
    }

    ${IconWrapper} {
      color: ${color("white")};
    }
  }
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
