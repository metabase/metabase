import { type PropsWithChildren, isValidElement } from "react";
import { cloneElement } from "react";

export const Repeat = ({
  times,
  /** Must be a valid React element */
  children,
}: PropsWithChildren<{
  times: number;
}>) => {
  if (!isValidElement(children)) {
    return null;
  }
  return (
    <>
      {Array.from({ length: times }).map((_, index) => {
        const props = { key: `${index}` };
        return cloneElement(children, props);
      })}
    </>
  );
};
