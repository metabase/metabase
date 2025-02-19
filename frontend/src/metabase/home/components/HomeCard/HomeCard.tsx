import type { ReactNode } from "react";

import { CardRoot } from "./HomeCard.styled";
import { PreviewHoverCard } from "metabase/core/components/Link/PreviewHoverCard";
import { CollectionItem } from "metabase-types/api";

interface HomeCardProps {
  className?: string;
  url?: string;
  external?: boolean;
  children?: ReactNode;
  preview?: CollectionItem;
}

export const HomeCard = ({
  className,
  url = "",
  preview,
  children,
}: HomeCardProps): JSX.Element => {
  const card = (
    <CardRoot className={className} to={url}>
      {children}
    </CardRoot>
  );
  return preview ? (
    <PreviewHoverCard preview={preview}>{card}</PreviewHoverCard>
  ) : (
    card
  );
};
