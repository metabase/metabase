import styled from "@emotion/styled";
import type { Theme } from "@emotion/react";
import { css } from "@emotion/react";

import EditableText from "metabase/core/components/EditableText";
import Link from "metabase/core/components/Link";

import { color } from "metabase/ui/utils/colors";

export const ModelInfoSection = styled.div``;

export const ModelInfoPanel = styled.div`
  padding-left: 2rem;
  border-left: 1px solid ${color("border")};
  width: 15rem;

  ${ModelInfoSection}:not(:first-of-type) {
    margin-top: 1rem;
  }
`;

export const ModelInfoTitle = styled.span`
  display: block;
  color: ${color("text-dark")};
  font-weight: 600;

  padding-left: 4px;
`;

export const valueBlockStyle = css`
  display: block;
  margin-top: 0.5rem;
  padding-left: 4px;
`;

const getCommonInfoTextStyle = (theme: Theme) => css`
  ${valueBlockStyle}
  color: ${theme.fn.themeColor("text-medium")};
`;

export const ModelInfoText = styled.span`
  ${({ theme }) => getCommonInfoTextStyle(theme)}
`;

export const ModelDescription = styled(EditableText)`
  ${({ theme }) => getCommonInfoTextStyle(theme)}
`;

export const ModelInfoLink = styled(Link)`
  ${({ theme }) => getCommonInfoTextStyle(theme)}
  color: ${color("brand")};
`;
