import type { Dispatch, SetStateAction } from "react";
import { t } from "ttag";

import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { Button, Group, Icon, Select, Stack, Text } from "metabase/ui";
import type {
  ComponentSettings,
  Field,
  FieldId,
  Table,
} from "metabase-types/api";

import { SortableFieldList } from "./SortableFieldList";

interface TableSettingsPanelProps {
  table: Table;
  value: ComponentSettings;
  onChange: Dispatch<SetStateAction<ComponentSettings>>;
}

export const TableSettingsPanel = ({
  table,
  value,
  onChange,
}: TableSettingsPanelProps) => {
  const fields = value.list_view.table.fields.map(({ field_id }: any) => {
    return (table?.fields ?? []).find((field: any) => field.id === field_id)!;
  });

  const visibleFields = value.list_view.table.fields.map(
    ({ field_id }: any) => {
      return fields.find((field: any) => field.id === field_id)!;
    },
  );

  const hiddenFields = (table?.fields ?? []).filter((field: any) =>
    value.list_view.table.fields.every((f: any) => f.field_id !== field.id),
  );

  const stylesMap = value.list_view.table.fields.reduce<
    Record<FieldId, "normal" | "bold" | "dim">
  >((acc, field) => {
    acc[field.field_id] = field.style;
    return acc;
  }, {});

  const handleOrderChange = (fieldOrder: FieldId[]) => {
    onChange((settings) => ({
      ...settings,
      list_view: {
        ...settings.list_view,
        table: {
          ...settings.list_view.table,
          fields: fieldOrder.map((id) => {
            return settings.list_view.table.fields.find(
              (field) => field.field_id === id,
            )!;
          }),
        },
      },
    }));
  };

  const handleStyleChange = (
    field: Field,
    style: "normal" | "bold" | "dim",
  ) => {
    onChange((settings) => ({
      ...settings,
      list_view: {
        ...settings.list_view,
        table: {
          ...settings.list_view.table,
          fields: settings.list_view.table.fields.map((f) => {
            if (f.field_id === getRawTableFieldId(field)) {
              return { ...f, style };
            }
            return f;
          }),
        },
      },
    }));
  };

  const handleRowHeightChange = (rowHeight: "thin" | "normal") => {
    onChange((settings) => ({
      ...settings,
      list_view: {
        ...settings.list_view,
        table: {
          ...settings.list_view.table,
          row_height: rowHeight,
        },
      },
    }));
  };
  return (
    <>
      <Select
        data={[
          { value: "normal", label: t`Normal` },
          { value: "thin", label: t`Thin` },
        ]}
        label={t`Row height`}
        value={value.list_view.table.row_height}
        onChange={handleRowHeightChange}
        w="100%"
      />

      {value.list_view.table.fields.length > 0 && (
        <Stack gap={8}>
          <Group justify="space-between">
            <Text
              c="text-primary"
              fw="bold"
              lh="var(--mantine-line-height-md)"
            >{t`Shown columns`}</Text>

            {value.list_view.table.fields.length > 0 && (
              <Button
                leftSection={<Icon name="eye_crossed_out" />}
                variant="subtle"
                h={20}
                p={0}
                onClick={() => {
                  onChange((settings) => ({
                    ...settings,
                    list_view: {
                      ...settings.list_view,
                      table: {
                        ...settings.list_view.table,
                        fields: [],
                      },
                    },
                  }));
                }}
              >{t`Hide all`}</Button>
            )}
          </Group>

          <SortableFieldList
            fields={visibleFields}
            stylesMap={stylesMap}
            onChange={handleOrderChange}
            onStyleChange={handleStyleChange}
            onToggleVisibility={(field) => {
              onChange((settings) => ({
                ...settings,
                list_view: {
                  ...settings.list_view,
                  table: {
                    ...settings.list_view.table,
                    fields: settings.list_view.table.fields.filter(
                      (f) => f.field_id !== field.id,
                    ),
                  },
                },
              }));
            }}
          />
        </Stack>
      )}

      {hiddenFields.length > 0 && (
        <Stack gap={8}>
          <Group justify="space-between">
            <Text
              c="text-primary"
              fw="bold"
              lh="var(--mantine-line-height-md)"
            >{t`Hidden columns`}</Text>

            {table.fields &&
              table.fields.length > 0 &&
              table.fields.length !== value.list_view.table.fields.length && (
                <Button
                  leftSection={<Icon name="eye" />}
                  variant="subtle"
                  h={20}
                  p={0}
                  onClick={() => {
                    onChange((settings) => ({
                      ...settings,
                      list_view: {
                        ...settings.list_view,
                        table: {
                          ...settings.list_view.table,
                          fields: [
                            ...settings.list_view.table.fields,
                            ...hiddenFields.map((field) => ({
                              field_id: getRawTableFieldId(field),
                              style: "normal" as const,
                            })),
                          ],
                        },
                      },
                    }));
                  }}
                >{t`Unhide all`}</Button>
              )}
          </Group>

          <SortableFieldList
            disabled
            fields={hiddenFields}
            isHidden
            onChange={handleOrderChange}
            onToggleVisibility={(field) => {
              onChange((settings) => ({
                ...settings,
                list_view: {
                  ...settings.list_view,
                  table: {
                    ...settings.list_view.table,
                    fields: [
                      ...settings.list_view.table.fields,
                      {
                        field_id: getRawTableFieldId(field),
                        style: "normal",
                      },
                    ],
                  },
                },
              }));
            }}
          />
        </Stack>
      )}
    </>
  );
};
