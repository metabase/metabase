import type { ReactNode } from "react";
import { t } from "ttag";

import { CopyButton } from "metabase/components/CopyButton";
import { Icon } from "metabase/ui";

import { AIAnalysisContent } from "../AIAnalysisContent";

import styles from "./AIAnalysisContentWrapper.module.css";

export interface AIAnalysisContentWrapperProps {
  title: string;
  explanation?: string;
  isLoading: boolean;
  onClose?: () => void;
  renderHeader?: () => ReactNode;
  children?: ReactNode;
}

export function AIAnalysisContentWrapper({
  title,
  explanation,
  isLoading,
  onClose,
  renderHeader,
  children,
}: AIAnalysisContentWrapperProps) {
  return (
    <div className={styles.contentWrapper}>
      <div className={styles.header}>
        <h3 className={styles.title}>{title}</h3>
        <div className={styles.actions}>
          {explanation && (
            <CopyButton
              value={explanation}
              className={styles.copyButton}
              aria-label={t`Copy summary`}
            />
          )}
          {onClose && (
            <button
              className={styles.closeButton}
              onClick={onClose}
              aria-label={t`Close`}
            >
              <Icon name="close" size={16} />
            </button>
          )}
        </div>
      </div>
      {renderHeader?.()}
      <AIAnalysisContent explanation={explanation} isLoading={isLoading} />
      {children}
    </div>
  );
}
