import LogoIcon from "metabase/common/components/LogoIcon";
import { Button, Group, Icon, Title } from "metabase/ui";

import type { ComponentConfiguration } from "../types";

type Props = {
  configuration: ComponentConfiguration;
  onConfigureClick: () => void;
};

export function ComponentEditorHeader({
  configuration,
  onConfigureClick,
}: Props) {
  return (
    <Group
      p="md"
      style={{ borderBottom: "1px solid var(--mb-color-border)" }}
      bg="white"
      justify="space-between"
    >
      <Group>
        <LogoIcon />
        <Title order={3}>{configuration.title ?? "Untitled Component"}</Title>
      </Group>
      <Group>
        <Button
          variant="outline"
          leftSection={<Icon name="gear" />}
          onClick={onConfigureClick}
        >
          {"Configure"}
        </Button>
        <Button variant="filled">{"Save"}</Button>
      </Group>
    </Group>
  );
}
