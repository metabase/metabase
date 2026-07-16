// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { MarkdownPreview } from "metabase/common/components/MarkdownPreview";
import { Box, type BoxProps } from "metabase/ui";

// Unjustified type cast. FIXME
export const ActionsContainer = styled(Box)<BoxProps>`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  visibility: hidden;
` as unknown as typeof Box;

export const Title = styled.div`
  font-weight: bold;
  font-size: 1rem;
  line-height: 1.5rem;
  color: var(--mb-color-text-primary);
  transition: color 0.2s ease;
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
`;

export const Description = styled(MarkdownPreview)`
  color: var(--mb-color-text-secondary);
  margin-top: 0.25rem;
`;

export const Body = styled.div`
  padding: 1rem 1.5rem 1.25rem;
  display: flex;
  flex-direction: column;
  cursor: pointer;

  &:hover {
    ${Title} {
      color: var(--mb-color-core-brand);
    }

    ${ActionsContainer} {
      visibility: visible;
    }
  }
`;

export const Header = styled.div`
  padding-bottom: 0.5rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
`;
