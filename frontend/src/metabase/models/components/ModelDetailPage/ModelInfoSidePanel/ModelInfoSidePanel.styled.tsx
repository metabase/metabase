import { css } from "@emotion/react";
import styled from "@emotion/styled";

import EditableText from "metabase/core/components/EditableText";
import Link from "metabase/core/components/Link";
import { color } from "metabase/lib/colors";

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

const commonInfoTextStyle = css`
  ${valueBlockStyle}
  color: ${color("text-medium")};
`;

export const ModelInfoText = styled.span`
  ${commonInfoTextStyle}
`;

export const ModelDescription = styled(EditableText)`
  ${commonInfoTextStyle}
`;

export const ModelInfoLink = styled(Link)`
  ${commonInfoTextStyle}
  color: ${color("brand")};
`;
