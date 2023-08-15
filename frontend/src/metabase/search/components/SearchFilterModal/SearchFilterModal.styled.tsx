import styled from "@emotion/styled";

export const SearchFilterWrapper = styled.div`
  & > * {
    border-bottom: 1px solid ${({ theme }) => theme.fn.primaryColor()};
    padding: 1.5rem 2rem;
    margin: 0;
  }
`;
