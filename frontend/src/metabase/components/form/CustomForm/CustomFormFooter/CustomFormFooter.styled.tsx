import styled from "@emotion/styled";

export interface CustomFormFooterStyledProps {
  shouldReverse?: boolean;
}
export const CustomFormFooterStyled = styled.div<CustomFormFooterStyledProps>`
  display: flex;
  flex-align: center;
  flex-direction: ${({ shouldReverse }) =>
    shouldReverse ? "row-reverse" : "column"};
`;
