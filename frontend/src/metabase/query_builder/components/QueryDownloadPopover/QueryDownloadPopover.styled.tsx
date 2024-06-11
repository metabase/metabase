import styled from "@emotion/styled";

export interface DownloadPopoverRootProps {
  isExpanded?: boolean;
}

export const DownloadPopoverRoot = styled.div<DownloadPopoverRootProps>`
  padding: 1rem;
  width: ${props => (props.isExpanded ? "18.75rem" : "16.25rem")};
`;

export const DownloadPopoverHeader = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem;
`;

export const DownloadPopoverMessage = styled.div`
  padding: 0 0.5rem;
`;

export const DownloadButtonRoot = styled.button`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  margin: 0.5rem 0;
  padding: 0.5rem;
  border-radius: 0.5rem;
  cursor: pointer;

  &:hover {
    background-color: var(--mb-color-brand);
  }
`;

export const DownloadButtonText = styled.div`
  color: var(--mb-color-text-dark);
  font-weight: bold;

  ${DownloadButtonRoot}:hover & {
    color: var(--mb-color-text-white);
  }
`;

export const DownloadButtonSecondaryText = styled.div`
  color: var(--mb-color-text-light);
  font-weight: bold;

  ${DownloadButtonRoot}:hover & {
    color: var(--mb-color-text-white);
  }
`;
