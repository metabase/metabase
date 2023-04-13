import React, { CSSProperties, HTMLAttributes, ReactNode } from "react";
import Subhead from "metabase/components/type/Subhead";
import { ViewSectionRoot } from "./ViewSection.styled";

interface ViewSectionProps extends HTMLAttributes<HTMLDivElement> {
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
  <div className="text-medium text-bold" {...props}>
    {children}
  </div>
);

export default ViewSection;
