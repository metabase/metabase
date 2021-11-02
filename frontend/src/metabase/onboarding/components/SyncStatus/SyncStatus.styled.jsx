import styled from "styled-components";
import { color } from "metabase/lib/colors";

export const SyncStatusRoot = styled.div`
  position: fixed;
  right: 1.5rem;
  bottom: 1.5rem;
  border-radius: 6px;
  background-color: ${color("white")};
  box-shadow: 0 1px 12px ${color("shadow")};
`;

export const DatabaseCard = styled.div`
  display: flex;
  align-items: center;
  margin: 0.75rem;
`;

export const DatabaseContent = styled.div`
  flex: 1 1 auto;
  margin: 0 0.75rem;
`;

export const DatabaseIcon = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 1rem;
  color: ${color("brand")};
  background-color: ${color("brand-light")};
`;

export const DatabaseTitle = styled.div`
  color: ${color("text-dark")};
  font-size: 0.875rem;
  font-weight: bold;
  line-height: 1rem;
`;

export const DatabaseDescription = styled.div`
  color: ${color("bg-dark")};
  font-size: 0.6875rem;
  font-weight: bold;
  line-height: 0.8125rem;
  margin-top: 0.25rem;
`;
