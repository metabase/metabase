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
        <SectionSkeleton rows={4} />
        <SectionSkeleton rows={5} />
        <SectionSkeleton rows={4} />
        <SectionSkeleton rows={4} />
      </Stack>
    </Stack>
  );
}

/** Loading placeholder shaped like the field panel's settings. */
export function FieldDetailsSkeleton() {
  return (
    <Stack gap="xxl" data-testid="field-details-skeleton">
      <SectionSkeleton rows={4} />
      <Repeat times={3}>
        <Stack gap="lg">
          <Skeleton h={16} w={96} />
          <Stack gap="lg" p="lg" bd={SECTION_BORDER} bdrs="lg">
            <Skeleton h={14} w={120} />
            <Skeleton h={40} />
          </Stack>
        </Stack>
      </Repeat>
    </Stack>
  );
}

/** Loading placeholder shaped like the database panel's sections. */
export function DatabaseDetailsSkeleton() {
  return (
    <Stack gap="xxl" data-testid="database-details-skeleton">
      <SectionSkeleton rows={2} />
      <SectionSkeleton rows={3} />
      <SectionSkeleton rows={2} />
      <SectionSkeleton rows={4} />
    </Stack>
  );
}

/** Loading placeholder shaped like the schema panel's sections. */
export function SchemaDetailsSkeleton() {
  return (
    <Stack gap="xxl" data-testid="schema-details-skeleton">
      <SectionSkeleton rows={3} />
      <SectionSkeleton rows={2} />
      <SectionSkeleton rows={2} />
      <SectionSkeleton rows={3} />
    </Stack>
  );
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
