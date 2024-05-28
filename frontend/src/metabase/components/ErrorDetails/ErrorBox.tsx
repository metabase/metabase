import { MonospaceErrorDisplay } from "./ErrorDetails.styled";
import type { ErrorDetails } from "./types";

export const ErrorBox = ({ children }: { children: ErrorDetails }) => (
  <MonospaceErrorDisplay>
    {/* ensure we don't try to render anything except a string */}
    {typeof children === "string"
      ? children
      : typeof children.message === "string"
      ? children.message
      : String(children)}
  </MonospaceErrorDisplay>
);
