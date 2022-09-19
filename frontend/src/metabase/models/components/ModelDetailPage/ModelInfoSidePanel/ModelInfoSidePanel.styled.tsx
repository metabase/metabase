import styled from "@emotion/styled";
import { css } from "@emotion/react";

import EditableText from "metabase/core/components/EditableText";

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

const commonInfoTextStyle = css`
  margin-top: 0.5rem;
  color: ${color("text-medium")};
  padding-left: 4px;
`;

export const ModelInfoText = styled.span`
  display: block;
  ${commonInfoTextStyle}
`;

export const ModelDescription = styled(EditableText)`
  ${commonInfoTextStyle}
`;
