import { useDisclosure } from "@mantine/hooks";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { useMemo, useState } from "react";
import { t } from "ttag";

import { useListTablesQuery } from "metabase/api";
import { ListEmptyState } from "metabase/common/components/ListEmptyState";
import { DataStudioBreadcrumbs } from "metabase/common/data-studio/components/DataStudioBreadcrumbs";
import { PaneHeader } from "metabase/common/data-studio/components/PaneHeader";
import { useHasTokenFeature } from "metabase/common/hooks";
import { SectionLayout } from "metabase/data-studio/app/components/SectionLayout";
import { LibraryUpsellPage } from "metabase/data-studio/upsells/pages";
import { useDispatch } from "metabase/redux";
import { push } from "metabase/router";
import {
  Badge,
  Button,
  Card,
  Flex,
  Group,
  Icon,
  Loader,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Table } from "metabase-types/api";

import { NewSeedModal } from "../../components/NewSeedModal";

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

  const { data: tables = [], isLoading } = useListTablesQuery({
    "data-source": "seed",
  });

  const seeds = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return tables;
    }
    return tables.filter((seed) =>
      (seed.display_name ?? seed.name).toLowerCase().includes(query),
    );
  }, [tables, searchQuery]);

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
                    onClick={() =>
                      dispatch(push(Urls.dataStudioTable(seed.id)))
                    }
                  />
                ))}
              </Stack>
            )}
          </Card>
        </Stack>
      </SectionLayout>
      <NewSeedModal opened={isModalOpen} onClose={closeModal} />
    </>
  );
}

function SeedRow({ seed, onClick }: { seed: Table; onClick: () => void }) {
  return (
    <UnstyledButton onClick={onClick} px="lg" py="md">
      <Group justify="space-between">
        <Group gap="sm">
          <Icon name={SEED_ICON} c="brand" />
          <Text fw="bold">{seed.display_name ?? seed.name}</Text>
          <Badge variant="light">{t`Seed`}</Badge>
        </Group>
        <Text c="text-secondary" size="sm">
          {t`updated ${dayjs(seed.updated_at).fromNow()}`}
        </Text>
      </Group>
    </UnstyledButton>
  );
}
