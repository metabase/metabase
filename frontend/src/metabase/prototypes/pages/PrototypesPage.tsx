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
 * registered prototypes grouped by `group`; the active one renders in the
 * main area with its description above it.
 */
export function PrototypesPage() {
  const { prototypeId } = useParams();
  // The index route shows the last-registered prototype (the newest work).
  const prototype =
    prototypeId === undefined
      ? PROTOTYPES.at(-1)
      : PROTOTYPES.find((candidate) => candidate.id === prototypeId);

  const ungrouped = PROTOTYPES.filter((candidate) => candidate.group == null);
  const groups = getGroups(PROTOTYPES);

  return (
    <Flex h="100%" mih="100vh">
      <Stack
        w={260}
        p="md"
        gap="xs"
        style={{
          borderRight: "1px solid var(--mb-color-border-neutral)",
          flexShrink: 0,
        }}
      >
        <Group justify="space-between" mb="sm" wrap="nowrap">
          <Title order={4}>{t`Prototypes`}</Title>
          <AppSwitcher />
        </Group>

        {ungrouped.length > 0 && (
          <>
            <PrototypeLinks prototypes={ungrouped} activeId={prototype?.id} />
            <Divider my="sm" />
          </>
        )}

        {groups.map(({ name, prototypes, drafts }, index) => (
          <Box key={name}>
            {index > 0 && <Divider my="sm" />}
            <NavLink
              label={name}
              childrenOffset="sm"
              // The newest group is the one being worked on.
              defaultOpened={
                index === groups.length - 1 ||
                prototypes.concat(drafts).some((p) => p.id === prototype?.id)
              }
            >
              <PrototypeLinks
                prototypes={prototypes}
                activeId={prototype?.id}
                mt="xs"
              />
              {drafts.length > 0 && (
                <NavLink
                  label={t`Other drafts`}
                  childrenOffset="sm"
                  defaultOpened={drafts.some((p) => p.id === prototype?.id)}
                >
                  <PrototypeLinks
                    prototypes={drafts}
                    activeId={prototype?.id}
                    mt="xs"
                  />
                </NavLink>
              )}
            </NavLink>
          </Box>
        ))}
      </Stack>

      <Box flex={1} p="lg" style={{ overflow: "auto", minWidth: 0 }}>
        {prototype ? (
          <Stack gap="md">
            <Box>
              <Title order={3}>{prototype.name}</Title>
              <Text c="text-secondary">{prototype.description}</Text>
            </Box>
            <prototype.Component />
          </Stack>
        ) : (
          <NotFound />
        )}
      </Box>
    </Flex>
  );
}

type PrototypeGroup = {
  name: string;
  prototypes: PrototypeDefinition[];
  drafts: PrototypeDefinition[];
};

function getGroups(prototypes: PrototypeDefinition[]): PrototypeGroup[] {
  const groups: PrototypeGroup[] = [];
  for (const prototype of prototypes) {
    if (prototype.group == null) {
      continue;
    }
    let group = groups.find((candidate) => candidate.name === prototype.group);
    if (!group) {
      group = { name: prototype.group, prototypes: [], drafts: [] };
      groups.push(group);
    }
    (prototype.draft ? group.drafts : group.prototypes).push(prototype);
  }
  return groups;
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
