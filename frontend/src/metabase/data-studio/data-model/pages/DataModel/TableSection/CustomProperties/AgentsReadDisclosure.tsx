import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import {
  Code,
  Collapse,
  Group,
  Icon,
  Stack,
  Text,
  UnstyledButton,
} from "metabase/ui";

type AgentsReadDisclosureProps = {
  sentences: string[];
  yaml: string;
};

export function AgentsReadDisclosure({
  sentences,
  yaml,
}: AgentsReadDisclosureProps) {
  const [isOpen, { toggle }] = useDisclosure(false);
  return (
    <Stack gap="sm">
      <UnstyledButton onClick={toggle} aria-expanded={isOpen}>
        <Group gap="xs">
          <Icon name={isOpen ? "chevrondown" : "chevronright"} size={12} />
          <Text fw="bold">{t`What agents read`}</Text>
        </Group>
      </UnstyledButton>
      <Collapse in={isOpen}>
        <Stack gap="sm">
          {sentences.map((sentence) => (
            <Text key={sentence} size="sm" c="text-primary">
              {sentence}
            </Text>
          ))}
          <Code block style={{ whiteSpace: "pre-wrap" }}>
            {yaml}
          </Code>
        </Stack>
      </Collapse>
    </Stack>
  );
}
