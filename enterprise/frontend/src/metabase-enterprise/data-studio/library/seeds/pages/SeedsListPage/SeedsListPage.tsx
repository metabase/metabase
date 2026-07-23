import { useDisclosure } from "@mantine/hooks";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { useMemo, useState } from "react";
import { t } from "ttag";

import { ListEmptyState } from "metabase/common/components/ListEmptyState";
import { DataStudioBreadcrumbs } from "metabase/common/data-studio/components/DataStudioBreadcrumbs";
import { PaneHeader } from "metabase/common/data-studio/components/PaneHeader";
import { useHasTokenFeature } from "metabase/common/hooks";
import { SectionLayout } from "metabase/data-studio/app/components/SectionLayout";
import { LibraryUpsellPage } from "metabase/data-studio/upsells/pages";
import { useDispatch } from "metabase/redux";
import { push } from "metabase/router";
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Flex,
  Group,
  Icon,
  Loader,
  Menu,
  Stack,
  Text,
  TextInput,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import { type Seed, useListSeedsQuery } from "metabase-enterprise/api";

import { DeleteSeedModal } from "../../components/DeleteSeedModal";
import { NewSeedModal } from "../../components/NewSeedModal";
import { ReplaceSeedModal } from "../../components/ReplaceSeedModal";

dayjs.extend(relativeTime);

const SEED_ICON = "table2";

export function SeedsListPage() {
  const hasLibraryFeature = useHasTokenFeature("library");

  if (!hasLibraryFeature) {
    return <LibraryUpsellPage />;
  }

  return <SeedsListPageContent />;
}

function SeedsListPageContent() {
  const dispatch = useDispatch();
  const [searchQuery, setSearchQuery] = useState("");
  const [isModalOpen, { open: openModal, close: closeModal }] =
    useDisclosure(false);
  const [replaceSeed, setReplaceSeed] = useState<Seed | null>(null);
  const [deleteSeed, setDeleteSeed] = useState<Seed | null>(null);

  const { data: allSeeds = [], isLoading } = useListSeedsQuery();

  const seeds = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return allSeeds;
    }
    return allSeeds.filter((seed) => seed.name.toLowerCase().includes(query));
  }, [allSeeds, searchQuery]);

  return (
    <>
      <SectionLayout>
        <PaneHeader
          breadcrumbs={
            <DataStudioBreadcrumbs>{t`Seeds`}</DataStudioBreadcrumbs>
          }
          px="3.5rem"
          py={0}
        />
        <Stack
          bg="background_page-secondary"
          data-testid="seeds-page"
          pb="2rem"
          px="3.5rem"
        >
          <Flex gap="md">
            <TextInput
              placeholder={t`Search...`}
              leftSection={<Icon name="search" />}
              bdrs="md"
              flex="1"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <Button leftSection={<Icon name="add" />} onClick={openModal}>
              {t`New seed`}
            </Button>
          </Flex>
          <Card withBorder p={0}>
            {isLoading ? (
              <Flex justify="center" p="xl">
                <Loader />
              </Flex>
            ) : seeds.length === 0 ? (
              <ListEmptyState label={t`No seeds yet`} />
            ) : (
              <Stack gap={0}>
                {seeds.map((seed) => (
                  <SeedRow
                    key={seed.id}
                    seed={seed}
                    onClick={() => {
                      if (seed.table_id != null) {
                        dispatch(push(Urls.dataStudioTable(seed.table_id)));
                      }
                    }}
                    onReplace={() => setReplaceSeed(seed)}
                    onDelete={() => setDeleteSeed(seed)}
                  />
                ))}
              </Stack>
            )}
          </Card>
        </Stack>
      </SectionLayout>
      <NewSeedModal opened={isModalOpen} onClose={closeModal} />
      {replaceSeed != null && (
        <ReplaceSeedModal
          seed={replaceSeed}
          opened
          onClose={() => setReplaceSeed(null)}
        />
      )}
      {deleteSeed != null && (
        <DeleteSeedModal
          seed={deleteSeed}
          opened
          onClose={() => setDeleteSeed(null)}
        />
      )}
    </>
  );
}

function SeedRow({
  seed,
  onClick,
  onReplace,
  onDelete,
}: {
  seed: Seed;
  onClick: () => void;
  onReplace: () => void;
  onDelete: () => void;
}) {
  return (
    <UnstyledButton onClick={onClick} px="lg" py="md">
      <Group justify="space-between">
        <Group gap="sm">
          <Icon name={SEED_ICON} c="brand" />
          <Text fw="bold">{seed.name}</Text>
          {seed.sync_error != null ? (
            <Tooltip label={seed.sync_error}>
              <Badge variant="light" color="negative">{t`Error`}</Badge>
            </Tooltip>
          ) : seed.table_id == null ? (
            <Badge variant="light" color="neutral">{t`Not materialized`}</Badge>
          ) : null}
        </Group>
        <Group gap="sm">
          <Text c="text-secondary" size="sm">
            {t`updated ${dayjs(seed.updated_at).fromNow()}`}
          </Text>
          <Menu position="bottom-end">
            <Menu.Target>
              <ActionIcon
                onClick={(e) => e.stopPropagation()}
                aria-label={t`Seed actions`}
              >
                <Icon name="ellipsis" />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                leftSection={<Icon name="refresh" />}
                onClick={(e) => {
                  e.stopPropagation();
                  onReplace();
                }}
              >
                {t`Replace CSV…`}
              </Menu.Item>
              <Menu.Item
                leftSection={<Icon name="download" />}
                component="a"
                href={`/api/ee/data-studio/seed/${seed.id}/csv`}
                onClick={(e) => e.stopPropagation()}
              >
                {t`Download CSV`}
              </Menu.Item>
              <Menu.Divider />
              <Menu.Item
                c="error"
                leftSection={<Icon name="trash" />}
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
              >
                {t`Delete…`}
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Group>
    </UnstyledButton>
  );
}
