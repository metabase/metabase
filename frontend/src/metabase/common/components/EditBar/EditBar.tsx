import cx from "classnames";
import type { ReactNode } from "react";

import { FullWidthContainer } from "metabase/styled-components/layout/FullWidthContainer";
import { Flex, Group, Icon, Text } from "metabase/ui";

import styles from "./EditBar.module.css";

type EditBarLocation = "app" | "admin" | "embedding-hub";

type EditBarProps = {
  title: string;
  center?: ReactNode;
  buttons: ReactNode;
  location?: EditBarLocation;
  className?: string;
  "data-testid"?: string;
};

export function EditBar({
  title,
  center,
  buttons,
  location = "app",
  className,
  "data-testid": dataTestId,
}: EditBarProps) {
  return (
    <Flex
      component={FullWidthContainer}
      className={cx(styles.root, className)}
      // for styling
      data-location={location}
      align="center"
      justify="space-between"
      pos="relative"
      py="sm"
      data-testid={dataTestId ?? "edit-bar"}
    >
      <Group gap="sm" align="center" wrap="nowrap">
        <Icon name="pencil" size={12} className={styles.content} />
        <Text component="span" className={styles.content} fw="bold" lh="md">
          {title}
        </Text>
      </Group>
      {center && <div>{center}</div>}
      <Flex gap="md">{buttons}</Flex>
    </Flex>
  );
}
