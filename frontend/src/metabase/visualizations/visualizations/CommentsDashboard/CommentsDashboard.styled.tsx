import styled from "@emotion/styled";
import { css } from "@emotion/react";
import { color } from "metabase/lib/colors";

export const Root = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 1rem;
  background: ${color("bg-white")};
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
`;

export const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
  gap: 1rem;
`;

export const Title = styled.h2`
  margin: 0;
  font-size: 1.5rem;
  font-weight: 600;
  color: ${color("text-dark")};
`;

export const Controls = styled.div`
  display: flex;
  gap: 0.75rem;
  align-items: center;
  flex-wrap: wrap;
`;

export const SearchInput = styled.input`
  padding: 0.5rem 0.75rem;
  border: 1px solid ${color("border")};
  border-radius: 4px;
  font-size: 0.875rem;
  min-width: 200px;
  transition: border-color 0.2s;

  &:focus {
    outline: none;
    border-color: ${color("brand")};
    box-shadow: 0 0 0 2px ${color("focus")};
  }
`;

export const FilterSelect = styled.select`
  padding: 0.5rem 0.75rem;
  border: 1px solid ${color("border")};
  border-radius: 4px;
  font-size: 0.875rem;
  background: ${color("bg-white")};
  cursor: pointer;
  min-width: 150px;

  &:focus {
    outline: none;
    border-color: ${color("brand")};
  }
`;

export const SortSelect = styled.select`
  padding: 0.5rem 0.75rem;
  border: 1px solid ${color("border")};
  border-radius: 4px;
  font-size: 0.875rem;
  background: ${color("bg-white")};
  cursor: pointer;

  &:focus {
    outline: none;
    border-color: ${color("brand")};
  }
`;

export const TableContainer = styled.div`
  flex: 1;
  overflow: auto;
  border: 1px solid ${color("border")};
  border-radius: 4px;
  margin-bottom: 1rem;
`;

export const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
`;

export const TableHeader = styled.th`
  padding: 0.75rem 1rem;
  text-align: left;
  font-weight: 600;
  color: ${color("text-dark")};
  background: ${color("bg-light")};
  border-bottom: 2px solid ${color("border")};
  position: sticky;
  top: 0;
  z-index: 1;
`;

export const TableRow = styled.tr`
  &:nth-of-type(even) {
    background: ${color("bg-light")};
  }

  &:hover {
    background: ${color("bg-medium")};
  }

  transition: background-color 0.2s;
`;

export const TableCell = styled.td`
  padding: 0.75rem 1rem;
  border-bottom: 1px solid ${color("border-light")};
  vertical-align: top;
`;

export const CommentRow = styled(TableRow)`
  cursor: pointer;

  &:hover {
    background: ${color("bg-medium")};
  }
`;

export const CommentContent = styled.div`
  padding: 1rem;
  background: ${color("bg-light")};
  border-radius: 4px;
  margin: 0.5rem 0;
`;

export const CommentHeader = styled.div`
  margin-bottom: 0.5rem;
  font-weight: 600;
  color: ${color("text-dark")};
`;

export const CommentText = styled.div`
  line-height: 1.5;
  color: ${color("text-medium")};
  white-space: pre-wrap;
  margin-bottom: 1rem;
`;

export const CommentMeta = styled.div`
  display: flex;
  gap: 2rem;
  font-size: 0.875rem;
  color: ${color("text-light")};

  & > div {
    display: flex;
    gap: 0.5rem;
  }
`;

export const CommentActions = styled.div`
  display: flex;
  gap: 0.5rem;
`;

export const ExpandButton = styled.button`
  padding: 0.25rem 0.5rem;
  border: 1px solid ${color("border")};
  border-radius: 4px;
  background: ${color("bg-white")};
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: ${color("bg-light")};
    border-color: ${color("brand")};
  }

  &:focus {
    outline: none;
    box-shadow: 0 0 0 2px ${color("focus")};
  }
`;

export const StatsContainer = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
`;

export const StatCard = styled.div`
  padding: 1rem;
  background: ${color("bg-light")};
  border-radius: 4px;
  text-align: center;
  border: 1px solid ${color("border-light")};
`;

export const StatValue = styled.div`
  font-size: 1.5rem;
  font-weight: 600;
  color: ${color("brand")};
  margin-bottom: 0.25rem;
`;

export const StatLabel = styled.div`
  font-size: 0.875rem;
  color: ${color("text-light")};
`;

export const Pagination = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
`;

export const PageButton = styled.button`
  padding: 0.5rem 1rem;
  border: 1px solid ${color("border")};
  border-radius: 4px;
  background: ${color("bg-white")};
  cursor: pointer;
  transition: all 0.2s;

  &:hover:not(:disabled) {
    background: ${color("bg-light")};
    border-color: ${color("brand")});
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &:focus {
    outline: none;
    box-shadow: 0 0 0 2px ${color("focus")};
  }
`;

export const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 300px;
  color: ${color("text-light")};
  gap: 1rem;

  svg {
    color: ${color("text-light")};
  }
`;

export const LoadingState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 300px;
  color: ${color("text-light")};
  gap: 1rem;

  svg {
    color: ${color("brand")};
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
`;

export const ErrorState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 300px;
  color: ${color("error")};
  gap: 1rem;
  text-align: center;

  button {
    padding: 0.5rem 1rem;
    border: 1px solid ${color("error")};
    border-radius: 4px;
    background: ${color("bg-white")};
    color: ${color("error")};
    cursor: pointer;
    transition: all 0.2s;

    &:hover {
      background: ${color("error")};
      color: ${color("text-white")};
    }
  }
`;