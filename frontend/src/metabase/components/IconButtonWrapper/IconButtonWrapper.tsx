// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";
import type { ButtonHTMLAttributes } from "react";

type IconButtonWrapperProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  circle?: boolean;
};

const IconButtonWrapper = styled(
  ({ circle, type = "button", ...props }: IconButtonWrapperProps) => (
    <button {...props} type={type} />
  ),
)`
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: ${props => (props.circle ? "50%" : "6px")};
  cursor: pointer;
`;

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default IconButtonWrapper;
