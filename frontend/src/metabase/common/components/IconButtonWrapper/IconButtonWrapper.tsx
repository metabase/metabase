// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";
import { type ButtonHTMLAttributes, forwardRef } from "react";

type IconButtonWrapperProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  circle?: boolean;
};

export const IconButtonWrapper = styled(
  forwardRef<HTMLButtonElement, IconButtonWrapperProps>(
    function IconButtonWrapper({ circle, type = "button", ...props }, ref) {
      return <button {...props} type={type} ref={ref} />;
    },
  ),
)`
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: ${(props) => (props.circle ? "50%" : "6px")};
  cursor: pointer;
`;
