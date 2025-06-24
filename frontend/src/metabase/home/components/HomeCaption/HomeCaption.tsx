import { CaptionRoot } from "./HomeCaption.styled";

interface HomeCaptionProps {
  primary?: boolean;
  children?: React.ReactNode;
}

export const HomeCaption = ({
  primary,
  children,
}: HomeCaptionProps): JSX.Element => {
  return <CaptionRoot primary={primary}>{children}</CaptionRoot>;
};
