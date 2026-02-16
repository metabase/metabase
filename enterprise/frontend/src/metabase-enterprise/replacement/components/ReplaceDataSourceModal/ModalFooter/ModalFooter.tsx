import { t } from "ttag";

import { Button, Flex, Group, Tooltip } from "metabase/ui";

import { MAX_WIDTH } from "../constants";
import type { ValidationInfo } from "../types";

import S from "./ModalFooter.module.css";

type ModalFooterProps = {
  submitLabel: string;
  validationInfo: ValidationInfo;
  isReplacing: boolean;
  onReplace: () => void;
  onClose: () => void;
};

export function ModalFooter({
  submitLabel,
  validationInfo,
  isReplacing,
  onReplace,
  onClose,
}: ModalFooterProps) {
  return (
    <Flex className={S.footer} p="lg" direction="column" align="center">
      <Group w="100%" maw={MAX_WIDTH} justify="flex-end">
        <Button onClick={onClose}>{t`Cancel`}</Button>
        <Tooltip
          label={validationInfo.errorMessage}
          disabled={validationInfo.errorMessage == null}
        >
          <Button
            variant="filled"
            loading={isReplacing}
            disabled={!validationInfo.isValid}
            onClick={onReplace}
          >
            {submitLabel}
          </Button>
        </Tooltip>
      </Group>
    </Flex>
  );
}
