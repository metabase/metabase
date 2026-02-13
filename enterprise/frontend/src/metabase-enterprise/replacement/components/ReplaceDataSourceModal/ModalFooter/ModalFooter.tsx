import { t } from "ttag";

import { Button, Flex, Group } from "metabase/ui";

import { MAX_WIDTH } from "../constants";

import S from "./ModalFooter.module.css";

type ModalFooterProps = {
  canReplace: boolean;
  isReplacing: boolean;
  onReplace: () => void;
  onClose: () => void;
};

export function ModalFooter({
  canReplace,
  isReplacing,
  onReplace,
  onClose,
}: ModalFooterProps) {
  return (
    <Flex className={S.footer} p="lg" direction="column" align="center">
      <Group w="100%" maw={MAX_WIDTH} justify="flex-end">
        <Button onClick={onClose}>{t`Cancel`}</Button>
        <Button
          variant="filled"
          loading={isReplacing}
          disabled={!canReplace}
          onClick={onReplace}
        >
          {t`Replace`}
        </Button>
      </Group>
    </Flex>
  );
}
