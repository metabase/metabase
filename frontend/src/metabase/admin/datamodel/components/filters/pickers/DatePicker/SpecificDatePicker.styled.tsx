import styled from "@emotion/styled";

interface DateInputContainerProps {
  isActive?: boolean;
}

export const DateInputContainer = styled.div<DateInputContainerProps>`
  display: flex;
  align-items: center;
  width: 100%;
  margin-bottom: 1rem;

  &:focus-within {
    border-color: var(--mb-color-brand);
  }
`;
