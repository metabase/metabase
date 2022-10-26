import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const InfoListItem = styled.div`
  width: 100%;
  display: flex;
  gap: 1rem;
  align-items: center;
  justify-content: space-between;
  overflow: hidden;
`;

export const ListItemTitle = styled.h3`
  font-size: 0.875rem;
  font-weight: bold;
`;

export const ListItemSubtitle = styled.div`
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 0.25rem;
  font-size: 0.75rem;
  font-weight: bold;
  color: ${color("text-medium")};
`;

export const InfoLeft = styled.div`
  min-width: 0;
  font-size: 0.75rem;
  font-weight: bold;
`;

export const InfoRight = styled.div`
  flex-shrink: 0;
  min-width: 0;
  font-size: 0.75rem;
  font-weight: bold;
`;
