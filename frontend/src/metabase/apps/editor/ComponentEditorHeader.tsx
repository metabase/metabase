import { Link } from "react-router";

import LogoIcon from "metabase/common/components/LogoIcon";
import { Button, Group, Icon, Select, Title } from "metabase/ui";

import type { ComponentConfiguration } from "../types";

type Props = {
  configuration: ComponentConfiguration;
  onConfigureClick: () => void;
  onSaveClick: () => void;
  onModeChange: (mode: string) => void;
  mode: string;
};

export function ComponentEditorHeader({
  configuration,
  onConfigureClick,
  onSaveClick,
  onModeChange,
  mode,
}: Props) {
  return (
    <Group
      p="md"
      style={{ borderBottom: "1px solid var(--mb-color-border)" }}
      bg="white"
      justify="space-between"
    >
      <Group>
        <Link to="/browse/apps">
          <LogoIcon />
        </Link>
        <Title order={3}>{configuration.title ?? "Untitled Component"}</Title>
      </Group>
      <Group>
        <Select
          value={mode}
          onChange={onModeChange}
          data={[
            { label: "Edit", value: "edit" as any },
            { label: "Preview", value: "preview" as any },
            { label: "JSON", value: "json" as any },
          ]}
        />
        <Button
          variant="outline"
          leftSection={<Icon name="gear" />}
          onClick={onConfigureClick}
        >
          {"Configure"}
        </Button>
        <Button variant="filled" onClick={onSaveClick}>
          {"Save"}
        </Button>
      </Group>
    </Group>
  );
}
