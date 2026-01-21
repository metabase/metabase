import { useState } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_DATA_STUDIO, PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { Anchor, Button, Group, Icon, Stack, Text } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

import { DependencyGraphModal } from "../DependencyGraphModal";

export function QuestionDependenciesSection({
  question,
}: {
  question: Question;
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const cardId = question.id();
  const canAccessDataStudio = useSelector(
    PLUGIN_DATA_STUDIO.canAccessDataStudio,
  );

  const { dependenciesCount, dependentsCount } =
    PLUGIN_DEPENDENCIES.useGetDependenciesCount({ id: cardId, type: "card" });

  if (!canAccessDataStudio) {
    return null;
  }

  const hasDependencies = dependenciesCount > 0 || dependentsCount > 0;

  if (!hasDependencies) {
    return (
      <Text c="text-secondary">{t`This question has no dependencies.`}</Text>
    );
  }

  return (
    <>
      <Stack gap="sm">
        <Group gap="xl">
          <Stack gap={0}>
            <Text fw="bold" fz="lg">
              {dependenciesCount}
            </Text>
            <Text c="text-secondary" fz="sm">{t`Upstream`}</Text>
          </Stack>
          <Stack gap={0}>
            <Text fw="bold" fz="lg">
              {dependentsCount}
            </Text>
            <Text c="text-secondary" fz="sm">{t`Downstream`}</Text>
          </Stack>
        </Group>
        <Group gap="md" justify="flex-start">
          <Button
            variant="subtle"
            leftSection={<Icon name="connections" />}
            onClick={() => setIsModalOpen(true)}
            pl={0}
          >
            {t`View dependency graph`}
          </Button>
          <Anchor
            component={Link}
            to={Urls.dependencyGraph({ entry: { id: cardId, type: "card" } })}
            c="text-secondary"
            fz="sm"
          >
            <Group gap="xs">
              {t`Open in Data Studio`}
              <Icon name="external" size={12} />
            </Group>
          </Anchor>
        </Group>
      </Stack>

      <DependencyGraphModal
        entry={{ id: cardId, type: "card" }}
        opened={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
}
