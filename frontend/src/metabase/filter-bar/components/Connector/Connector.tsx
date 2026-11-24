import { Flex, Icon } from "metabase/ui";

import S from "./Connector.module.css";

type ConnectorProps = {
  label: string;
  isParen?: boolean;
};

export const Connector = ({ label, isParen }: ConnectorProps) => (
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
  >
    <span className={S.label}>{label}</span>
    <span className={S.removeIcon}>
      <Icon name="close" size={12} />
    </span>
  </Flex>
);
