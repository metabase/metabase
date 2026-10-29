import cx from "classnames";
import type { PropsWithChildren } from "react";

import { LogoBadge } from "metabase/embedding/components/LogoBadge";
import { Flex } from "metabase/ui";

import EmbeddingFooterS from "./EmbeddingFooter.module.css";

export type FooterVariant = "default" | "large";

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
    <Flex
      component="footer"
      data-testid="embedding-footer"
      className={cx(EmbeddingFooterS.EmbeddingFooter, {
        [EmbeddingFooterS.borderTop]: variant === "default",
      })}
      flex="0 0 auto"
      align="center"
      justify={variant === "large" ? "center" : undefined}
      mb={variant === "large" ? "xxl" : undefined}
    >
      {hasEmbedBranding && <LogoBadge dark={!!isDarkMode} />}

      {children}
    </Flex>
  );
};
