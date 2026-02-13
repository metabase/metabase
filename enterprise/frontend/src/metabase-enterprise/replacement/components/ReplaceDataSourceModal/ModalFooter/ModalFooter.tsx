import { t } from "ttag";

import { Button, Flex, Group } from "metabase/ui";

import { MAX_WIDTH } from "../constants";

import S from "./ModalFooter.module.css";

type ModalFooterProps = {
  onClose: () => void;
};

export function ModalFooter({ onClose }: ModalFooterProps) {
  return (
    <Flex className={S.footer} p="lg" direction="column" align="center">
      <Group w="100%" maw={MAX_WIDTH} justify="flex-end">
        <Button onClick={onClose}>{t`Cancel`}</Button>
        <Button variant="filled">{t`Replace`}</Button>
      </Group>
    </Flex>
  );
}
