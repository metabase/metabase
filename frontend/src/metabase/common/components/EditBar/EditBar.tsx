import cx from "classnames";
import type { ReactNode } from "react";

<<<<<<< 8bfda478850
import { Flex, Group } from "metabase/ui";

import { EditIcon, Root, Title } from "./EditBar.styled";
=======
import { FullWidthContainer } from "metabase/styled-components/layout/FullWidthContainer";
import { Group, Icon } from "metabase/ui";

import styles from "./EditBar.module.css";
>>>>>>> d53a909a92f^

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
<<<<<<< 8bfda478850
      <Flex gap="md">{buttons}</Flex>
    </Root>
=======
      <div className={cx(styles.buttonsContainer, { [styles.brand]: isBrand })}>
        {buttons}
      </div>
    </FullWidthContainer>
>>>>>>> d53a909a92f^
  );
}
