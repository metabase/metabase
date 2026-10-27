import cx from "classnames";
import { t } from "ttag";

import {
  useCreateGlossaryMutation,
  useDeleteGlossaryMutation,
  useListGlossaryQuery,
  useUpdateGlossaryMutation,
} from "metabase/api";
import { GlossaryDescription } from "metabase/common/components/Glossary/GlossaryDescription";
import { GlossaryTable } from "metabase/common/components/Glossary/GlossaryTable";
import CS from "metabase/css/core/index.css";
import { SidebarLayout } from "metabase/reference/components/SidebarLayout";
import BaseSidebar from "metabase/reference/guide/BaseSidebar";
import { Group, Stack, Text } from "metabase/ui";

export function GlossaryContainer() {
  const { data } = useListGlossaryQuery();
  const glossary = data?.data ?? [];
  const canWrite = data?.can_write ?? false;
  const [createGlossary] = useCreateGlossaryMutation();
  const [updateGlossary] = useUpdateGlossaryMutation();
  const [deleteGlossary] = useDeleteGlossaryMutation();

  return (
    <SidebarLayout
      className={cx(CS.flexFull, CS.relative)}
      sidebar={<BaseSidebar />}
    >
      <Stack w="100%" h="100%">
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
        <Stack
          w="100%"
          gap={0}
          m={0}
          className={cx(CS.wrapper, CS.wrapperTrim)}
        >
          <GlossaryDescription mb="lg" />
          <GlossaryTable
            glossary={glossary}
            readOnly={!canWrite}
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
        </Stack>
      </Stack>
    </SidebarLayout>
  );
}
