import React, { ReactNode } from "react";

export interface HomeCaptionProps {
  children?: ReactNode;
}

const HomeCaption = ({ children }: HomeCaptionProps): JSX.Element => {
  return <HomeCaption>{children}</HomeCaption>;
};

export default HomeCaption;
