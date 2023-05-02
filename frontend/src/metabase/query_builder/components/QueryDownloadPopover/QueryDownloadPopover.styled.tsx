import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";

const FORMAT_COLORS: Record<string, string> = {
  csv: color("filter"),
  xlsx: color("summarize"),
  json: color("bg-dark"),
  png: color("accent0"),
};

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
    background-color: ${color("brand")};
  }
`;

interface DownloadButtonIconProps {
  format: string;
}

export const DownloadButtonIcon = styled(Icon)<DownloadButtonIconProps>`
  width: 2rem;
  height: 2rem;
  color: ${props => FORMAT_COLORS[props.format] ?? color("brand")};

  ${DownloadButtonRoot}:hover & {
    color: ${color("white")};
  }
`;

export const DownloadButtonText = styled.div`
  color: ${color("text-dark")};
  font-weight: bold;

  ${DownloadButtonRoot}:hover & {
    color: ${color("white")};
  }
`;
