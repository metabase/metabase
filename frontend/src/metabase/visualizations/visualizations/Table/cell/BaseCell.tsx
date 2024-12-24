import type React from "react";
import type { HTMLAttributes } from "react";

export interface BaseCellProps extends HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  textAlign: "left" | "right";
}

export const BaseCell = ({ children, textAlign, ...rest }: BaseCellProps) => {
  return (
    <div style={{ textAlign }} {...rest}>
      {children}
    </div>
  );
};
