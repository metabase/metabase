import styled from "@emotion/styled";
import { css } from "@emotion/react";
import { color } from "metabase/lib/colors";

export const DetailRoot = styled.div`
  display: flex;
  align-items: center;
  position: relative;
`;

export interface DetailBodyProps {
  isEditing?: boolean;
}

export const DetailBody = styled.div<DetailBodyProps>`
  flex: ${props => props.isEditing && "1 0 auto"};
  padding-bottom: 2rem;
  max-width: 56.25rem;
`;

export const DetailTitle = styled.span`
  color: ${color("text-medium")};
  display: inline-block;
  font-weight: bold;
`;

export interface DetailSubtitleProps {
  hasDescription?: boolean;
}

export const DetailSubtitle = styled.div<DetailSubtitleProps>`
  color: ${color("text-light")};
  padding-top: 0.375rem;

  ${({ hasDescription }) =>
    hasDescription &&
    css`
      color: ${color("text-dark")};
      white-space: pre-wrap;
      font-size: 1rem;
      line-height: 1.5rem;
    `}
`;

export const DetailError = styled.span`
  color: ${color("text-error")};
`;
