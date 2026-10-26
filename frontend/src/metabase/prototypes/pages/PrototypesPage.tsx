import { t } from "ttag";

import { NotFound } from "metabase/common/components/ErrorPages";
import { AppSwitcher } from "metabase/nav/components/AppSwitcher";
import { Link, useParams } from "metabase/router";
import {
  Box,
  Divider,
  Flex,
  Group,
  NavLink,
  Stack,
  Text,
  Title,
} from "metabase/ui";

import { PROTOTYPES } from "../registry";
import type { PrototypeDefinition } from "../types";

/**
 * Throwaway canvas for clickable prototypes on real data. A rail lists the
 * registered prototypes; the active one renders in the main area.
 */
export function PrototypesPage() {
  const { prototypeId } = useParams();
  // The index route shows the first prototype; an unknown id is a 404.
  const prototype =
    prototypeId === undefined
      ? PROTOTYPES[0]
      : PROTOTYPES.find((candidate) => candidate.id === prototypeId);

  // The drills reference and Baseline sit above the iterations: neither is a direction.
  const [docs, baseline, ...directions] = PROTOTYPES;
  const iteration1 = directions.filter(
    (candidate) => candidate.iteration === 1,
  );
  const iteration2 = directions.filter(
    (candidate) => candidate.iteration === 2,
  );

  const iteration3 = directions.filter(
    (candidate) => candidate.iteration === 3,
  );

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

        <PrototypeLinks
          prototypes={[docs, baseline]}
          activeId={prototype?.id}
        />

        <Divider my="sm" />

        <NavLink label={t`Iteration 1`} childrenOffset="sm">
          <PrototypeLinks
            prototypes={iteration1}
            activeId={prototype?.id}
            mt="xs"
          />
        </NavLink>

        <Divider my="sm" />

        <NavLink
          label={t`Iteration 2`}
          childrenOffset="sm"
          defaultOpened={false}
        >
          <PrototypeLinks
            prototypes={iteration2}
            activeId={prototype?.id}
            mt="xs"
          />
        </NavLink>
        <Divider my="sm" />

        <Text fw="bold" px="sm">{t`Iteration 3`}</Text>
        <PrototypeLinks prototypes={iteration3} activeId={prototype?.id} />
      </Stack>

      <Box flex={1} p="lg" style={{ overflow: "auto" }}>
        {prototype ? <prototype.Component /> : <NotFound />}
      </Box>
    </Flex>
  );
}

type PrototypeLinksProps = {
  prototypes: PrototypeDefinition[];
  activeId: string | undefined;
  mt?: string;
};

function PrototypeLinks({ prototypes, activeId, mt }: PrototypeLinksProps) {
  return (
    <Stack gap="xs" mt={mt}>
      {prototypes.map((candidate) => (
        <NavLink
          key={candidate.id}
          component={Link}
          to={`/prototypes/${candidate.id}`}
          label={candidate.name}
          active={candidate.id === activeId}
        />
      ))}
    </Stack>
  );
}
