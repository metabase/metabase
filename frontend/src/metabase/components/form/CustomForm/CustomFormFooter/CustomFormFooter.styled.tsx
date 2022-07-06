import styled from "@emotion/styled";

interface CustomFormFooterStyledProps {
  shouldReverse?: boolean;
}
export const CustomFormFooterStyled = styled.div<CustomFormFooterStyledProps>`
  display: flex;
  align-items: flex-start;
  flex-direction: ${({ shouldReverse }) =>
    shouldReverse ? "row-reverse" : "column"};
`;
