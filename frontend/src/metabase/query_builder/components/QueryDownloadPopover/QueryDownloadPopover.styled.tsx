import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";

export interface DownloadPopoverRootProps {
  isExpanded?: boolean;
}

export const DownloadPopoverRoot = styled.div<DownloadPopoverRootProps>`
  padding: 1rem;
  width: ${props => (props.isExpanded ? "18.75rem" : "16.25rem")};
`;

export const DownloadPopoverHeader = styled.div`
  padding: 0.5rem;
`;

export const DownloadPopoverMessage = styled.div`
  padding: 0 0.5rem;
`;

export const DownloadButtonRoot = styled.button`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  margin: 0.5rem 0;
  padding: 0.5rem;
  border-radius: 0.5rem;
  cursor: pointer;

  &:hover {
    color: ${color("white")};
    background-color: ${color("brand")};
  }
`;

export const DownloadButtonIcon = styled(Icon)`
  width: 2rem;
  height: 2rem;
`;
