import { Flex, Icon } from "metabase/ui";

import S from "./Connector.module.css";

type ConnectorProps = {
  label: string;
  isParen?: boolean;
  isSelected: boolean;
  hasError: boolean;
  onRemove: () => void;
};

export const Connector = ({
  label,
  isParen,
  isSelected,
  hasError,
  onRemove,
}: ConnectorProps) => (
  <Flex
    className={S.connector}
    component="span"
    pos="relative"
    align="center"
    justify="center"
    py="xxs"
    px={isParen ? "xxs" : "xs"}
    bdrs="md"
    c="text-primary"
    ff="monospace"
    fz="sm"
    fw={500}
    lh={1.15}
    tt="uppercase"
    data-selected={isSelected || undefined}
    data-error={hasError || undefined}
    onMouseDown={(event) => event.preventDefault()}
    onClick={onRemove}
  >
    <span className={S.label}>{label}</span>
    <span className={S.removeIcon}>
      <Icon name="close" size={12} />
    </span>
  </Flex>
);
