import React, { ReactNode } from "react";
import { CaptionRoot } from "./HomeCaption.styled";

export interface HomeCaptionProps {
  primary?: boolean;
  children?: ReactNode;
}

const HomeCaption = ({ primary, children }: HomeCaptionProps): JSX.Element => {
  return <CaptionRoot primary={primary}>{children}</CaptionRoot>;
};

export default HomeCaption;
