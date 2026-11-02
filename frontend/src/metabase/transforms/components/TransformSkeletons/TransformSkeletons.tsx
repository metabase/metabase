import type { ReactNode } from "react";

import {
  FormSkeleton,
  LoadingSkeleton,
  TextSkeleton,
  getSkeletonLineWidth,
} from "metabase/common/components/Skeletons";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import CS from "metabase/css/core/index.css";
import {
  Box,
  Card,
  Divider,
  Flex,
  Group,
  Modal,
  Skeleton,
  Stack,
  type StackProps,
  TreeTableSkeleton,
} from "metabase/ui";

const BUTTON_HEIGHT = 40;
const TAB_COUNT = 4;

type PaneHeaderSkeletonProps = {
  withIcon?: boolean;
  withTabs?: boolean;
};

/** Breadcrumbs, title, and tabs of a `PaneHeader`. */
function PaneHeaderSkeleton({
  withIcon = true,
  withTabs = true,
}: PaneHeaderSkeletonProps) {
  return (
    <Stack gap={0} pt="xxs">
      <Flex mb="xl" mt="lg" h="xxl" align="center">
        <Skeleton h={12} w={240} radius="xs" />
      </Flex>
      <Stack gap="lg">
        <Group gap="sm" h="2rem" wrap="nowrap">
          {withIcon && <Skeleton h={20} w={20} radius="xs" />}
          <Skeleton h={20} w={240} radius="xs" />
        </Group>
        {withTabs && (
          <Group gap="xxs">
            {Array.from({ length: TAB_COUNT }, (_, index) => (
              <Skeleton key={index} h="2.2rem" w={88} radius="xl" />
            ))}
          </Group>
        )}
      </Stack>
    </Stack>
  );
}

type TransformPageSkeletonProps = PaneHeaderSkeletonProps & {
  gap?: StackProps["gap"];
  children: ReactNode;
};

/**
 * Loading state of a full transforms or jobs page: a `PageContainer` with a
 * header skeleton above `children`. Renders its own `LoadingSkeleton` root.
 */
export function TransformPageSkeleton({
  withIcon,
  withTabs,
  gap = "xxl",
  children,
}: TransformPageSkeletonProps) {
  return (
    <PageContainer>
      <LoadingSkeleton flex={1} gap={gap}>
        <PaneHeaderSkeleton withIcon={withIcon} withTabs={withTabs} />
        {children}
      </LoadingSkeleton>
    </PageContainer>
  );
}

/** A `TitleSection`: a title and description over a bordered card. */
function SectionSkeleton({ children }: { children: ReactNode }) {
  return (
    <Stack>
      <Stack gap="sm">
        <Skeleton h={16} w={160} radius="xs" />
        <Skeleton h={12} w={320} radius="xs" />
      </Stack>
      <Card p={0} shadow="none" withBorder>
        {children}
      </Card>
    </Stack>
  );
}

/** The query or Python editor box of the definition and new transform pages. */
export function TransformEditorSkeleton() {
  return (
    <Stack
      gap={0}
      flex={1}
      bg="background_page-primary"
      bdrs="sm"
      bd="1px solid var(--mb-color-border-neutral)"
    >
      <Flex
        h="3rem"
        px="md"
        align="center"
        justify="space-between"
        className={CS.borderBottom}
      >
        <Skeleton h={14} w={140} radius="xs" />
        <Skeleton h={28} w={28} radius="sm" />
      </Flex>
      <Stack gap="md" p="lg">
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton
            key={index}
            h={12}
            w={getSkeletonLineWidth(index)}
            radius="xs"
          />
        ))}
      </Stack>
    </Stack>
  );
}

/** The run tab's section: last run status, run button, and tags. */
export function TransformRunSectionSkeleton() {
  return (
    <SectionSkeleton>
      <Group p="xl" justify="space-between" wrap="nowrap">
        <Stack gap="sm">
          <Skeleton h={14} w={220} radius="xs" />
          <Skeleton h={12} w={80} radius="xs" />
        </Stack>
        <Skeleton h={BUTTON_HEIGHT} w={100} radius="sm" />
      </Group>
      <Divider />
      <Group p="xl" gap="xl" wrap="nowrap">
        <Stack gap="sm">
          <Skeleton h={14} w={200} radius="xs" />
          <Skeleton h={12} w={260} radius="xs" />
        </Stack>
        <Skeleton h={BUTTON_HEIGHT} w={300} radius="sm" />
      </Group>
    </SectionSkeleton>
  );
}

/** The settings tab's ownership, target, and incremental sections. */
export function TransformSettingsSkeleton() {
  return (
    <Stack gap="2.5rem">
      <SectionSkeleton>
        <Group p="xl">
          <Skeleton h={BUTTON_HEIGHT} w={300} radius="sm" />
        </Group>
      </SectionSkeleton>
      <SectionSkeleton>
        <Group p="xl">
          <Skeleton h={14} w={320} radius="xs" />
        </Group>
        <Divider />
        <Group p="xl">
          <Skeleton h={BUTTON_HEIGHT} w={140} radius="sm" />
          <Skeleton h={BUTTON_HEIGHT} w={200} radius="sm" />
        </Group>
      </SectionSkeleton>
      <SectionSkeleton>
        <Group p="xl" justify="space-between">
          <Skeleton h={14} w={240} radius="xs" />
          <Skeleton h={20} w={36} radius="xl" />
        </Group>
      </SectionSkeleton>
    </Stack>
  );
}

/** The indexes tab's create button over the index table. */
export function TransformIndexesSkeleton() {
  return (
    <Stack>
      <Group justify="flex-end">
        <Skeleton h={BUTTON_HEIGHT} w={120} radius="sm" />
      </Group>
      <Card p={0} shadow="none" withBorder>
        <TreeTableSkeleton
          rowsCount={3}
          columnWidths={[0.2, 0.1, 0.2, 0.1, 0.1, 0.15, 0.1, 0.05]}
        />
      </Card>
    </Stack>
  );
}

/** The table of transforms in a job, in the order they run. */
export function JobTransformsTableSkeleton() {
  return (
    <TreeTableSkeleton rowsCount={3} columnWidths={[0.35, 0.3, 0.2, 0.15]} />
  );
}

/** The job page's schedule, tags, and transforms sections. */
export function JobEditorSkeleton() {
  return (
    <Stack gap="3.5rem">
      <SectionSkeleton>
        <Box px="xxl" py="xl">
          <Skeleton h={BUTTON_HEIGHT} w="60%" radius="sm" />
        </Box>
        <Divider />
        <Group px="xxl" py="lg" justify="space-between">
          <Skeleton h={12} w={240} radius="xs" />
          <Skeleton h={BUTTON_HEIGHT} w={100} radius="sm" />
        </Group>
      </SectionSkeleton>
      <SectionSkeleton>
        <Box p="xxl">
          <Skeleton h={BUTTON_HEIGHT} radius="sm" />
        </Box>
      </SectionSkeleton>
      <SectionSkeleton>
        <JobTransformsTableSkeleton />
      </SectionSkeleton>
    </Stack>
  );
}

type RunListSkeletonProps = {
  filterWidths: number[];
  columnWidths: number[];
  rowsCount: number;
  /** Controls next to the filters that don't depend on the loading data. */
  actions?: ReactNode;
};

/**
 * Loading state of a run list page: the filter bar over the run table.
 * Renders its own `LoadingSkeleton` root.
 */
export function RunListSkeleton({
  filterWidths,
  columnWidths,
  rowsCount,
  actions,
}: RunListSkeletonProps) {
  return (
    <LoadingSkeleton flex="0 1 auto" mih={0} gap="xl" pt="2.5rem">
      <Group justify="space-between" align="center" wrap="nowrap">
        <Group>
          {filterWidths.map((width, index) => (
            <Skeleton key={index} h={BUTTON_HEIGHT} w={width} radius="sm" />
          ))}
        </Group>
        {actions}
      </Group>
      <Card
        className={CS.overflowHidden}
        p={0}
        flex="0 1 auto"
        mih={0}
        shadow="none"
        withBorder
      >
        <TreeTableSkeleton rowsCount={rowsCount} columnWidths={columnWidths} />
      </Card>
    </LoadingSkeleton>
  );
}

type ModalFormSkeletonProps = {
  fields: number;
};

/** Form fields and footer buttons of a transforms modal form. */
export function ModalFormSkeleton({ fields }: ModalFormSkeletonProps) {
  return (
    <Box>
      <FormSkeleton fields={fields} gap="xl" />
      <ModalFooterSkeleton />
    </Box>
  );
}

/** A confirmation message with two radio choices, above the footer buttons. */
export function ModalChoiceSkeleton() {
  return (
    <Box>
      <Stack gap="xl">
        <TextSkeleton lines={2} />
        <Stack gap="sm">
          {Array.from({ length: 2 }, (_, index) => (
            <Group key={index} gap="sm" wrap="nowrap">
              <Skeleton h={20} w={20} circle />
              <Skeleton h={12} w={getSkeletonLineWidth(index)} radius="xs" />
            </Group>
          ))}
        </Stack>
      </Stack>
      <ModalFooterSkeleton />
    </Box>
  );
}

function ModalFooterSkeleton() {
  return (
    <Modal.Footer>
      <Skeleton h={BUTTON_HEIGHT} w={80} radius="sm" />
      <Skeleton h={BUTTON_HEIGHT} w={120} radius="sm" />
    </Modal.Footer>
  );
}
