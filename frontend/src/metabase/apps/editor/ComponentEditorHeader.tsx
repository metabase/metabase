import { Link } from "react-router";

import LogoIcon from "metabase/common/components/LogoIcon";
import { Button, Group, Icon, Title } from "metabase/ui";

import type { ComponentConfiguration } from "../types";

type Props = {
  configuration: ComponentConfiguration;
  onConfigureClick: () => void;
  onSaveClick: () => void;
};

export function ComponentEditorHeader({
  configuration,
  onConfigureClick,
  onSaveClick,
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
