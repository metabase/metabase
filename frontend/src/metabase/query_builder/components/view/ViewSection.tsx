import cx from "classnames";
import type { CSSProperties, HTMLAttributes, ReactNode, Ref } from "react";

import { Subhead } from "metabase/common/components/type/Subhead";
import CS from "metabase/css/core/index.css";
import { Flex, type FlexProps, type TextProps } from "metabase/ui";

import S from "./ViewSection.module.css";

export type ViewSectionProps = FlexProps & {
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  /** PROTOTYPE: lets a header measure itself (React 19 passes it through). */
  ref?: Ref<HTMLDivElement>;
};

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

type ViewHeadingProps = TextProps & {
  children?: ReactNode;
};

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
