import { useClipboard } from "@mantine/hooks";
import cx from "classnames";
import type { CSSProperties, ReactNode } from "react";
import { t } from "ttag";

import Styles from "metabase/css/core/index.css";
import visuallyHidden from "metabase/css/core/visually-hidden.module.css";
import { Icon, Text, Tooltip, UnstyledButton } from "metabase/ui";

import S from "./CopyButton.module.css";

export const COPY_BUTTON_ICON = <Icon name="copy" aria-hidden />;

type CopyButtonProps = {
  value: string;
  onCopy?: () => void;
  className?: string;
  style?: CSSProperties;
  "aria-label"?: string;
  target?: ReactNode;
};

export const CopyButton = ({
  value,
  onCopy,
  className = Styles.textBrandHover,
  style,
  "aria-label": ariaLabel,
  target,
}: CopyButtonProps) => {
  const clipboard = useClipboard({ timeout: 2000 });
  const accessibleName = ariaLabel ?? (target ? undefined : t`Copy`);

  const handleClick = () => {
    clipboard.copy(value);
    onCopy?.();
  };

  return (
    <>
      <UnstyledButton
        className={cx(S.CopyButton, className)}
        data-testid="copy-button"
        aria-label={accessibleName}
        onClick={handleClick}
        style={style}
      >
        <Tooltip
          label={<Text fw={700} c="inherit">{t`Copied!`}</Text>}
          opened={clipboard.copied}
        >
          <span>{target ?? COPY_BUTTON_ICON}</span>
        </Tooltip>
      </UnstyledButton>
      <span role="status" className={visuallyHidden.visuallyHidden}>
        {clipboard.copied ? t`Copied!` : ""}
      </span>
    </>
  );
};
