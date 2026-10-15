import { t } from "ttag";

import { EditableText } from "metabase/common/components/EditableText";
import { Box, Flex } from "metabase/ui";

import S from "./ActionCreatorHeader.module.css";

type ActionCreatorHeaderProps = {
  name: string;
  isEditable: boolean;
  canRename: boolean;
  onChangeName: (name: string) => void;
  actionButtons: React.ReactElement[];
};

export function ActionCreatorHeader({
  name = t`New Action`,
  isEditable,
  canRename,
  onChangeName,
  actionButtons,
}: ActionCreatorHeaderProps) {
  return (
    <Flex
      className={S.borderBottom}
      flex="0 0 auto"
      align="center"
      justify="space-between"
      w="100%"
      py="lg"
      px="xxl"
      bg="background_page-primary"
    >
      <EditableText
        initialValue={name}
        onChange={onChangeName}
        isDisabled={!isEditable || !canRename}
        fz="lg"
        fw="bold"
        c="text-secondary"
      />
      {actionButtons.length > 0 && (
        // The buttons are borderless, so the negative margin lines them up with the edge
        <Box mr="-sm">{actionButtons}</Box>
      )}
    </Flex>
  );
}
