import { css } from "@emotion/react";
import styled from "@emotion/styled";

import EditableText from "metabase/core/components/EditableText";
import Link from "metabase/core/components/Link";
import { color } from "metabase/lib/colors";

export const ModelInfoSection = styled.div``;

export const ModelInfoPanel = styled.div`
  padding-left: 2rem;
  border-left: 1px solid var(--mb-color-border);
  width: 15rem;

  ${ModelInfoSection}:not(:first-of-type) {
    margin-top: 1rem;
  }
`;

export const ModelInfoTitle = styled.span`
  display: block;
  color: var(--mb-color-text-dark);
  font-weight: 600;

  padding-left: 4px;
`;

export const valueBlockStyle = css`
  display: block;
  margin-top: 0.5rem;
  padding-left: 4px;
`;

export const ModelInfoText = styled.span`
  ${valueBlockStyle};
  color: var(--mb-color-text-medium);
`;

export const ModelDescription = styled(EditableText)`
  ${valueBlockStyle};
  color: var(--mb-color-text-medium);
`;

export const ModelInfoLink = styled(Link)`
  ${valueBlockStyle};
  color: var(--mb-color-text-medium);
`;
