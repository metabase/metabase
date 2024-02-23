import type { ReactNode } from "react";

import { CaptionRoot } from "./HomeCaption.styled";

interface HomeCaptionProps {
  primary?: boolean;
  children?: ReactNode;
}

export const HomeCaption = ({
  primary,
  children,
}: HomeCaptionProps): JSX.Element => {
  return <CaptionRoot primary={primary}>{children}</CaptionRoot>;
};
