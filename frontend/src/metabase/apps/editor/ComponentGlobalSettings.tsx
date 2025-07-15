import { IconCheck, IconPlus, IconTable, IconTrash } from "@tabler/icons-react";
import { useState } from "react";

import { useListTablesQuery } from "metabase/api";
import { uuid } from "metabase/lib/uuid";
import {
  ActionIcon,
  Button,
  Group,
  Radio,
  Select,
  Skeleton,
  Stack,
  Text,
  TextInput,
} from "metabase/ui";

import {
  DEFAULT_SPACING,
  SPACING_OPTIONS_WITH_ZERO,
} from "../const/systemComponents";
import type {
  ComponentConfiguration,
  ComponentDataSource,
  ComponentFormScope,
} from "../types";

import { SelectTable } from "./SelectTable";
import { SidebarSubtitle } from "./SidebarSubtitle";

type Props = {
  configuration: ComponentConfiguration;
  onConfigurationChange: (
    configuration: Partial<ComponentConfiguration>,
  ) => void;
};

const CONTEXT_TYPE_OPTIONS = [
  {
    label: "Without Context",
    value: "none",
  },
  {
    label: "Table Record",
    value: "tableRow",
  },
  {
    label: "Question Record",
    value: "question",
    disabled: true,
  },
  {
    label: "Model Record",
    value: "model",
    disabled: true,
  },
];

const DATA_SOURCE_TYPE_OPTIONS = [
  {
    label: "Table",
    value: "table",
  },
  {
    label: "Question",
    value: "question",
    disabled: true,
  },
  {
    label: "Model",
    value: "model",
    disabled: true,
  },
];

export function ComponentGlobalSettings({
  configuration,
  onConfigurationChange,
}: Props) {
  const [currentDataSource, setCurrentDataSource] =
    useState<Partial<ComponentDataSource> | null>(null);

  const [currentFormScope, setCurrentFormScope] =
    useState<Partial<ComponentFormScope> | null>(null);

  const { data: tables } = useListTablesQuery();

  const handleSaveDataSource = () => {
    if (!currentDataSource) {
      return;
    }

    if (!currentDataSource.tableId) {
      return;
    }

    onConfigurationChange({
      dataSources: [
        ...(configuration.dataSources ?? []),
        {
          id: uuid(),
          type: currentDataSource.type as "table",
          tableId: currentDataSource.tableId as number,
          databaseId: currentDataSource.databaseId as number,
          name: currentDataSource.name ?? "",
        },
      ],
    });

    setCurrentDataSource(null);
  };

  const handleSaveFormScope = () => {
    if (!currentFormScope) {
      return;
    }

    if (!currentFormScope.name) {
      return;
    }

    onConfigurationChange({
      formScopes: [
        ...(configuration.formScopes ?? []),
        {
          id: uuid(),
          name: currentFormScope.name,
        },
      ],
    });

    setCurrentFormScope(null);
  };

  const handleDeleteDataSource = (dataSourceId: string) => {
    onConfigurationChange({
      dataSources: configuration.dataSources?.filter(
        (dataSource) => dataSource.id !== dataSourceId,
      ),
    });
  };

  const handleDeleteFormScope = (formScopeId: string) => {
    onConfigurationChange({
      formScopes: configuration.formScopes?.filter(
        (formScope) => formScope.id !== formScopeId,
      ),
    });
  };

  return (
    <Stack gap="xl">
      <Stack>
        <SidebarSubtitle>{"Settings"}</SidebarSubtitle>
        <Radio.Group
          value={configuration.type}
          onChange={(value) => {
            onConfigurationChange({
              type: value as "page" | "component",
            });
          }}
        >
          <Group gap="sm">
            <Radio label="Page" value="page" />
            <Radio label="Component" value="component" />
          </Group>
        </Radio.Group>
        <TextInput
          label={configuration.type === "page" ? "Page name" : "Component name"}
          placeholder="Enter a name"
          value={configuration.title}
          onChange={(e) => {
            onConfigurationChange({
              title: e.target.value,
            });
          }}
        />
        {configuration.type === "page" && (
          <>
            <TextInput
              label="URL Slug"
              placeholder="my-page-slug"
              value={configuration.urlSlug ?? configuration.id}
              onChange={(e) => {
                onConfigurationChange({ urlSlug: e.target.value });
              }}
            />
            <Select
              label="Padding"
              placeholder="Select a padding"
              data={SPACING_OPTIONS_WITH_ZERO}
              value={configuration.pagePadding ?? DEFAULT_SPACING}
              onChange={(value) => {
                onConfigurationChange({ pagePadding: value });
              }}
            />
          </>
        )}
      </Stack>
      <Stack>
        <SidebarSubtitle>{"Component Context"}</SidebarSubtitle>
        <Select
          value={configuration.context ?? "none"}
          onChange={(value) => {
            onConfigurationChange({ context: value });
          }}
          label="Type"
          placeholder="Select a context type"
          data={CONTEXT_TYPE_OPTIONS}
        />
        {configuration.context === "tableRow" && (
          <SelectTable
            value={configuration.contextTableId}
            onChange={(value) => {
              onConfigurationChange({ contextTableId: value });
            }}
          />
        )}
      </Stack>

      <Stack>
        <SidebarSubtitle>{"Data Sources"}</SidebarSubtitle>
        {configuration.dataSources?.map((dataSource) => (
          <Group key={dataSource.id} justify="space-between">
            {tables ? (
              <Group gap="sm">
                <IconTable size={16} color="var(--mb-color-brand)" />
                <Text>
                  {
                    tables.find((table) => table.id === dataSource.tableId)
                      ?.display_name
                  }
                </Text>
              </Group>
            ) : (
              <Skeleton visible flex={1} h="16px" />
            )}
            <Group gap="0">
              <ActionIcon onClick={() => handleDeleteDataSource(dataSource.id)}>
                <IconTrash size={16} />
              </ActionIcon>
            </Group>
          </Group>
        ))}
        {currentDataSource ? (
          <>
            <Select
              value={currentDataSource.type ?? "none"}
              onChange={(value) => {
                setCurrentDataSource({
                  ...currentDataSource,
                  type: value as "table",
                });
              }}
              label="Data Source Type"
              placeholder="Select a data source type"
              data={DATA_SOURCE_TYPE_OPTIONS}
            />
            <SelectTable
              value={currentDataSource.tableId?.toString()}
              onChange={(value) => {
                const table = tables?.find(
                  (table) => table.id === Number(value),
                );
                setCurrentDataSource({
                  ...currentDataSource,
                  tableId: Number(value),
                  databaseId: table?.db_id ?? 1,
                  name: table?.display_name ?? "",
                });
              }}
            />
            <Button
              variant="filled"
              leftSection={<IconCheck size={16} />}
              onClick={handleSaveDataSource}
            >
              {"Save Data Source"}
            </Button>
          </>
        ) : (
          <Button
            variant="filled"
            leftSection={<IconPlus size={16} />}
            onClick={() => {
              setCurrentDataSource({ type: "table" });
            }}
          >
            {"Add Data Source"}
          </Button>
        )}
      </Stack>

      <Stack>
        <SidebarSubtitle>{"Form Scopes"}</SidebarSubtitle>
        {configuration.formScopes?.map((formScope) => (
          <Group key={formScope.id} justify="space-between">
            <Text>{formScope.name}</Text>
            <ActionIcon onClick={() => handleDeleteFormScope(formScope.id)}>
              <IconTrash size={16} />
            </ActionIcon>
          </Group>
        ))}
        {currentFormScope ? (
          <>
            <TextInput
              label="Form Scope Name"
              placeholder="Enter a name"
              value={currentFormScope.name}
              onChange={(e) => {
                setCurrentFormScope({
                  ...currentFormScope,
                  name: e.target.value,
                });
              }}
            />
            <Button
              variant="filled"
              leftSection={<IconCheck size={16} />}
              onClick={handleSaveFormScope}
            >
              {"Save Form Scope"}
            </Button>
          </>
        ) : (
          <Button
            variant="filled"
            leftSection={<IconPlus size={16} />}
            onClick={() => {
              setCurrentFormScope({ name: "My Form" });
            }}
          >
            {"Add Form Scope"}
          </Button>
        )}
      </Stack>
    </Stack>
  );
}
