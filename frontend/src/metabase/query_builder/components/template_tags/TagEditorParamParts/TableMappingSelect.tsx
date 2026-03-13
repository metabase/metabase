import { t } from "ttag";

import { SchemaAndTableDataSelector } from "metabase/query_builder/components/DataSelector";
import { Box, Group, HoverCard, Icon, Switch, Text } from "metabase/ui";
import type Database from "metabase-lib/v1/metadata/Database";
import type { TableId, TemplateTag } from "metabase-types/api";

import { ContainerLabel, ErrorSpan, InputContainer } from "./TagEditorParam";

type TableMappingSelectProps = {
  tag: TemplateTag;
  database?: Database | null;
  databases: Database[];
  onChange: (tableId: TableId) => void;
  onChangeEmitAlias: (emitAlias: boolean) => void;
};

export function TableMappingSelect({
  tag,
  database,
  databases,
  onChange,
  onChangeEmitAlias,
}: TableMappingSelectProps) {
  const tableId = tag["table-id"];
  const isEmpty = tableId == null;

  return (
    <>
      <InputContainer>
        <ContainerLabel>
          <Group gap="xs">
            {t`Table to map to`}
            {isEmpty && <ErrorSpan>{t`(required)`}</ErrorSpan>}
          </Group>
        </ContainerLabel>
        <SchemaAndTableDataSelector
          databases={databases}
          selectedDatabase={database || null}
          selectedDatabaseId={database?.id || null}
          selectedTable={tableId}
          selectedTableId={tableId}
          setSourceTableFn={onChange}
          isInitiallyOpen={tableId == null}
          isMantine
        />
      </InputContainer>
      <InputContainer>
        <Group gap="xs">
          <Switch
            id={`emit-alias-toggle-${tag.id}`}
            label={t`Emit table alias`}
            checked={tag["emit-alias"] ?? true}
            onChange={(e) => onChangeEmitAlias(e.currentTarget.checked)}
          />
          <HoverCard>
            <HoverCard.Target>
              <Icon
                c="text-secondary"
                name="info"
                data-testid="emit-alias-info-icon"
              />
            </HoverCard.Target>
            <HoverCard.Dropdown>
              <Box p="md" maw="24rem">
                <Text>
                  {t`When enabled, the table reference will include an alias matching the variable name.`}
                </Text>
              </Box>
            </HoverCard.Dropdown>
          </HoverCard>
        </Group>
      </InputContainer>
    </>
  );
}
