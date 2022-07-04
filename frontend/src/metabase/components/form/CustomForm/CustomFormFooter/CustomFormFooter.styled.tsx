import styled from "@emotion/styled";

interface CustomFormFooterStyledProps {
  shouldReverse?: boolean;
}
export const CustomFormFooterStyled = styled.div<CustomFormFooterStyledProps>`
  display: flex;
  align-items: center;
  flex-direction: ${({ shouldReverse }) =>
    shouldReverse ? "row-reverse" : "column"};
`;
