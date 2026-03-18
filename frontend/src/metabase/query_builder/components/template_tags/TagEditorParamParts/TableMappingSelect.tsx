import { useId } from "react";
import { t } from "ttag";

import S from "metabase/parameters/components/RequiredParamToggle/RequiredParamToggle.module.css";
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
  const id = useId();

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
        <Group gap="sm">
          <Switch
            id={id}
            checked={tag["emit-alias"] ?? true}
            onChange={(e) => onChangeEmitAlias(e.currentTarget.checked)}
          />
          <Box>
            <label className={S.SettingRequiredLabel} htmlFor={id}>
              {t`Use variable name as alias`}
              <HoverCard>
                <HoverCard.Target>
                  <Icon
                    c="text-secondary"
                    name="info"
                    data-testid="emit-alias-info-icon"
                  />
                </HoverCard.Target>
                <HoverCard.Dropdown>
                  <Text p="md" maw="24rem">
                    {t`You can refer to this table by the variable name in other parts of the query.`}
                  </Text>
                </HoverCard.Dropdown>
              </HoverCard>
            </label>
          </Box>
        </Group>
      </InputContainer>
    </>
  );
}
