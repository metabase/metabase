import type { ReactNode } from "react";

interface HeadingProps {
  children: ReactNode;
}

const Heading = ({ children }: HeadingProps) => <h4>{children}</h4>;

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Heading;
