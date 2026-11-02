import { Group, Repeat, Skeleton, Stack } from "metabase/ui";

const SECTION_BORDER = "1px solid var(--mb-color-border-neutral)";

/** Loading placeholder shaped like the table panel's Details tab. */
export function TableDetailsSkeleton() {
  return (
    <Stack gap="xl" data-testid="table-details-skeleton">
      <Group gap="lg">
        <Repeat times={4}>
          <Skeleton h={16} w={64} />
        </Repeat>
      </Group>
      <Stack gap="xxl">
        <SectionSkeleton rows={8} />
        <SectionSkeleton rows={4} />
      </Stack>
    </Stack>
  );
}

/** Loading placeholder shaped like the field panel's settings. */
export function FieldDetailsSkeleton() {
  return (
    <Stack gap="lg" data-testid="field-details-skeleton">
      <NameDescriptionSkeleton />
      <Group justify="space-between" wrap="nowrap">
        <Skeleton h={16} w={96} />
        <Group gap="lg" wrap="nowrap">
          <Skeleton h={32} w={88} />
          <Skeleton h={32} w={112} />
        </Group>
      </Group>
      <Stack gap="xxl">
        <Repeat times={3}>
          <Stack gap="lg" p="xl" bd={SECTION_BORDER} bdrs="md">
            <Skeleton h={14} w={120} />
            <Skeleton h={40} />
            <Skeleton h={40} />
          </Stack>
        </Repeat>
      </Stack>
    </Stack>
  );
}

function NameDescriptionSkeleton() {
  return <Skeleton h={98} radius="sm" />;
}

function SectionSkeleton({ rows }: { rows: number }) {
  return (
    <Stack gap="lg">
      <Skeleton h={16} w={96} />
      <Stack gap="md" p="lg" bd={SECTION_BORDER} bdrs="lg">
        <Repeat times={rows}>
          <Group justify="space-between" wrap="nowrap">
            <Skeleton h={14} w="35%" />
            <Skeleton h={14} w="40%" />
          </Group>
        </Repeat>
      </Stack>
    </Stack>
  );
}
