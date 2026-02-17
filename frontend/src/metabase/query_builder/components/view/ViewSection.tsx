import cx from "classnames";
import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

import { Subhead } from "metabase/common/components/type/Subhead";
import CS from "metabase/css/core/index.css";
import { Flex, type FlexProps } from "metabase/ui";

import S from "./ViewSection.module.css";

export interface ViewSectionProps
  extends HTMLAttributes<HTMLDivElement>,
    FlexProps {
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

export const ViewSection = ({
  className,
  style,
  children,
  ...rest
}: ViewSectionProps) => (
  <Flex className={cx(S.ViewSectionRoot, className)} style={style} {...rest}>
    {children}
  </Flex>
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
