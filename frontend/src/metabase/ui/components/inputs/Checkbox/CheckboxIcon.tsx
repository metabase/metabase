import type { CheckboxProps } from "@mantine/core";

const CHECK_PATH =
  "M12.3086 6.3584L7.71191 10.9551C7.22374 11.443 6.43241 11.4432 5.94434 10.9551L3.46973 8.48047L4.53027 7.41895L6.82812 9.71777L11.248 5.29785L12.3086 6.3584Z";

const INDETERMINATE_PATH = "M12 7.25V8.75H4V7.25H12Z";

export const CheckboxIcon: CheckboxProps["icon"] = ({
  indeterminate,
  className,
}) => (
  <svg
    className={className}
    viewBox="0 0 16 16"
    fill="currentcolor"
    aria-hidden="true"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d={indeterminate ? INDETERMINATE_PATH : CHECK_PATH} />
  </svg>
);
