import { useDisclosure } from "@mantine/hooks";
import { type ReactNode, useId } from "react";

import {
  Box,
  Card,
  Collapse,
  Group,
  Icon,
  Text,
  UnstyledButton,
} from "metabase/ui";

import S from "./DetailPanel.module.css";

export type DetailPanelProps = {
  title: string;
  /** Right side of the title row: a single link or button out to the full editor/view. */
  actions?: ReactNode;
  /** Drop body padding. Tables and the embedded graph draw their own. */
  flush?: boolean;
  /** Let the title row expand and collapse the body, accordion-style. */
  collapsible?: boolean;
  /** Start collapsed. Only applies when `collapsible` is set. */
  defaultCollapsed?: boolean;
  children: ReactNode;
  "data-testid"?: string;
};

export function DetailPanel({
  title,
  actions,
  flush,
  collapsible = false,
  defaultCollapsed = false,
  children,
  "data-testid": dataTestId,
}: DetailPanelProps) {
  const [isOpened, { toggle }] = useDisclosure(
    !(collapsible && defaultCollapsed),
  );
  const bodyId = useId();
  const titleText = (
    <Text fw="bold" size="sm">
      {title}
    </Text>
  );
  const body = <Box p={flush ? 0 : "lg"}>{children}</Box>;

  return (
    <Card withBorder shadow="none" p={0} data-testid={dataTestId}>
      <Group
        justify="space-between"
        align="center"
        wrap="nowrap"
        px="lg"
        py="sm"
        className={S.header}
        data-collapsed={!isOpened || undefined}
      >
        {collapsible ? (
          <UnstyledButton
            className={S.toggle}
            aria-expanded={isOpened}
            aria-controls={bodyId}
            onClick={toggle}
          >
            <Group gap="xs" wrap="nowrap">
              <Icon
                name={isOpened ? "chevrondown" : "chevronright"}
                size={12}
                aria-hidden
              />
              {titleText}
            </Group>
          </UnstyledButton>
        ) : (
          titleText
        )}
        {actions}
      </Group>
      {collapsible ? (
        <Collapse in={isOpened} id={bodyId}>
          {body}
        </Collapse>
      ) : (
        body
      )}
    </Card>
  );
}
