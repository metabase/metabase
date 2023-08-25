import { forwardRef } from "react";
import type { ComponentPropsWithoutRef } from "react";

interface SelectItemProps extends ComponentPropsWithoutRef<"div"> {
  label: string;
}

export const SelectItem = forwardRef<HTMLDivElement, SelectItemProps>(
  function SelectItem({ label, ...others }: SelectItemProps, ref) {
    return (
      <div ref={ref} {...others}>
        {label}
      </div>
    );
  },
);
