import cx from "classnames";
import type { ReactNode } from "react";

import { FullWidthContainer } from "metabase/styled-components/layout/FullWidthContainer";
import { Group, Icon } from "metabase/ui";

import styles from "./EditBar.module.css";

type Props = {
  title: string;
  center?: ReactNode;
  buttons: ReactNode;
  admin?: boolean;
  className?: string;
  "data-testid"?: string;
};

export function EditBar({
  title,
  center,
  buttons,
  admin = false,
  className,
  "data-testid": dataTestId,
}: Props) {
  const isBrand = !admin;

  return (
    <FullWidthContainer
      className={cx(styles.root, { [styles.brand]: isBrand }, className)}
      data-testid={dataTestId ?? "edit-bar"}
    >
      <Group gap="sm" align="center" wrap="nowrap">
        <Icon name="pencil" size={12} className={styles.editIcon} />
        <span className={styles.title}>{title}</span>
      </Group>
      {center && <div>{center}</div>}
      <div className={cx(styles.buttonsContainer, { [styles.brand]: isBrand })}>
        {buttons}
      </div>
    </FullWidthContainer>
  );
}
