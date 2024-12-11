import cx from "classnames";
import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

import Subhead from "metabase/components/type/Subhead";
import CS from "metabase/css/core/index.css";

import { ViewSectionRoot } from "./ViewSection.styled";

export interface ViewSectionProps extends HTMLAttributes<HTMLDivElement> {
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

const ViewSection = ({
  className,
  style,
  children,
  ...rest
}: ViewSectionProps) => (
  <ViewSectionRoot className={className} style={style} {...rest}>
    {children}
  </ViewSectionRoot>
);

interface ViewHeadingProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
}

export const ViewHeading = ({ children, ...props }: ViewHeadingProps) => (
  <Subhead {...props}>{children}</Subhead>
);

interface ViewSubHeadingProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
}

export const ViewSubHeading = ({ children, ...props }: ViewSubHeadingProps) => (
  <div className={cx(CS.textMedium, CS.textBold)} {...props}>
    {children}
  </div>
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ViewSection;
