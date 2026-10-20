import { t } from "ttag";

import { AppSwitcher } from "metabase/nav/components/AppSwitcher";
import { Link, useParams } from "metabase/router";
import { Box, Flex, Group, NavLink, Stack, Title } from "metabase/ui";

import { PROTOTYPES } from "../registry";

/**
 * Throwaway canvas for clickable prototypes on real data. A rail lists the
 * registered prototypes; the active one renders in the main area.
 */
export function PrototypesPage() {
  const { prototypeId } = useParams();
  const prototype =
    PROTOTYPES.find((candidate) => candidate.id === prototypeId) ??
    PROTOTYPES[0];

  return (
    <Flex h="100%" mih="100vh">
      <Stack
        w={260}
        p="md"
        gap="xs"
        style={{ borderRight: "1px solid var(--mb-color-border-neutral)" }}
      >
        <Group justify="space-between" mb="sm" wrap="nowrap">
          <Title order={4}>{t`Prototypes`}</Title>
          <AppSwitcher />
        </Group>
        {PROTOTYPES.map((candidate) => (
          <NavLink
            key={candidate.id}
            component={Link}
            to={`/prototypes/${candidate.id}`}
            label={candidate.name}
            active={candidate.id === prototype.id}
          />
        ))}
      </Stack>

      <Box flex={1} p="lg" style={{ overflow: "auto" }}>
        <prototype.Component />
      </Box>
    </Flex>
  );
}
