import type { PropsWithChildren } from "react";

import {
  Footer,
  type FooterVariant,
} from "metabase/public/components/EmbedFrame/EmbedFrame.styled";
import { LogoBadge } from "metabase/public/components/EmbedFrame/LogoBadge";

import EmbeddingFooterS from "./EmbeddingFooter.module.css";

type Props = {
  hasEmbedBranding: boolean;
  variant: FooterVariant;
  isDarkMode?: boolean;
};

export const EmbeddingFooter = ({
  children,
  hasEmbedBranding,
  variant,
  isDarkMode,
}: PropsWithChildren<Props>) => {
  return (
    <Footer
      data-testid="embedding-footer"
      className={EmbeddingFooterS.EmbeddingFooter}
      variant={variant}
    >
      {hasEmbedBranding && <LogoBadge dark={!!isDarkMode} />}

      {children}
    </Footer>
  );
};
