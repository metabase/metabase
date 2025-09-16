import cx from "classnames";
import { t } from "ttag";

import {
  useCreateGlossaryMutation,
  useDeleteGlossaryMutation,
  useListGlossaryQuery,
  useUpdateGlossaryMutation,
} from "metabase/api";
import CS from "metabase/css/core/index.css";
import { Card, Group, Stack, Text } from "metabase/ui";

import S from "./Glossary.module.css";
import { GlossaryTable } from "./GlossaryTable";

export function Glossary() {
  const { data: glossary = [] } = useListGlossaryQuery();
  const [createGlossary] = useCreateGlossaryMutation();
  const [updateGlossary] = useUpdateGlossaryMutation();
  const [deleteGlossary] = useDeleteGlossaryMutation();

  return (
    <Stack w="100%">
      <Group
        align="center"
        wrap="nowrap"
        px="2.625rem"
        h="3rem"
        mt="2rem"
        justify="space-between"
      >
        <Text fw="bold" fz="1.5rem">{t`Glossary`}</Text>
      </Group>
      <Stack w="100%" gap={0} m={0} className={cx(CS.wrapper, CS.wrapperTrim)}>
        <Card px="lg" className={cx(CS.bordered, S.card)}>
          <GlossaryTable
            className={S.table}
            glossary={glossary}
            onCreate={async (term, definition) => {
              await createGlossary({ term, definition });
            }}
            onEdit={async (id, term, definition) => {
              await updateGlossary({ id, term, definition });
            }}
            onDelete={async (id) => {
              await deleteGlossary({ id });
            }}
          />
        </Card>
      </Stack>
    </Stack>
  );
}
