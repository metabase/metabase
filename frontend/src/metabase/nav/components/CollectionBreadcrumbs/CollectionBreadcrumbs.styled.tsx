import styled from "@emotion/styled";

import Button from "metabase/core/components/Button";

export const PathContainer = styled.div`
  display: flex;
  align-items: center;
  min-width: 0;
`;

export const BreadcrumbsPathSeparator = styled.div`
  display: flex;
  align-items: center;
  color: var(--mb-color-text-light);
  font-size: 0.8em;
  font-weight: bold;
  margin-left: 0.5rem;
  margin-right: 0.5rem;
  user-select: none;
`;

export const ExpandButton = styled(Button)`
  border: none;
  margin: 0;
  padding: 0.25rem;
  background-color: var(--mb-color-bg-collection-browser-expand-button);
  border-radius: 2px;
  color: var(--mb-color-text-collection-browser-expand-button);

  &:hover {
    color: var(--mb-color-text-collection-browser-expand-button-hover);
    background-color: var(--mb-color-bg-collection-browser-expand-button-hover);
  }
`;
