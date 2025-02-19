import { Link, type LinkProps } from "react-router";

import { type CollectionItem } from "metabase-types/api";
import { PreviewHoverCard } from "./PreviewHoverCard";

export type Link_MaybeWithPreviewProps = {
  preview?: CollectionItem;
} & LinkProps;

export const Link_MaybeWithPreview = ({
  preview,
  children,
  ...props
}: Link_MaybeWithPreviewProps) => {
  const link = <Link {...props}>{children}</Link>;

  return preview ? (
    <PreviewHoverCard preview={preview} {...props}>
      {link}
    </PreviewHoverCard>
  ) : (
    link
  );
};
