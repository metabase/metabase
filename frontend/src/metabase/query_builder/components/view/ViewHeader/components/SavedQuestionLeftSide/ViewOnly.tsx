import { t } from "ttag";

import { Flex, HoverCard, Icon, Text, rem } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import S from "./SavedQuestionLeftSide.module.css";
import { useHiddenSourceTables } from "./hooks";

export function ViewOnlyTag({ question }: { question: Question }) {
  const { isEditable } = Lib.queryDisplayInfo(question.query());
  const hiddenSourceTables = useHiddenSourceTables(question);

  if (isEditable) {
    return null;
  }

  const tableName = hiddenSourceTables[0]?.displayName;

  return (
    <HoverCard position="bottom-start" disabled={!tableName}>
      <HoverCard.Target>
        <Flex align="center" gap="xs" px={4} py={2} mt={4} className={S.badge}>
          <Icon name="lock_filled" size={12} />
          <Text size="xs" fw="bold">
            {t`View-only`}
          </Text>
        </Flex>
      </HoverCard.Target>
      <HoverCard.Dropdown>
        <Text
          maw={rem(360)}
          p="md"
        >{t`One of the administrators hid the source table “${tableName}”, making this question view-only.`}</Text>
      </HoverCard.Dropdown>
    </HoverCard>
  );
}
