import { BannerRoot } from "metabase/components/Banner/Banner.styled";
import Markdown from "metabase/core/components/Markdown";
import { ReactNode } from "react";

const Banner = ({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) => {
  const content =
    typeof children === "string" ? <Markdown>{children}</Markdown> : children;

  return <BannerRoot className={className}>{content}</BannerRoot>;
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Banner;
