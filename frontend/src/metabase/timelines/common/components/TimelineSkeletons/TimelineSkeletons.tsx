import { t } from "ttag";

import { ModalContent } from "metabase/common/components/ModalContent";
import {
  FormSkeleton,
  getSkeletonLineWidth,
} from "metabase/common/components/Skeletons";
import { MODAL_MIN_HEIGHT } from "metabase/timelines/common/constants";
import { ActionIcon, Box, Flex, Icon, Skeleton, Stack } from "metabase/ui";

import ModalBody from "../ModalBody";
import { ModalFooter } from "../ModalFooter";
import { ModalHeader } from "../ModalHeader";

const BUTTON_HEIGHT = 40;
const EVENT_FORM_FIELDS = 4;
const TIMELINE_FORM_FIELDS = 3;

type ModalSkeletonProps = {
  onClose?: () => void;
};

/** A modal header whose title comes from the data that is still loading. */
function ModalHeaderSkeleton({ onClose }: ModalSkeletonProps) {
  return (
    <Box p="xxl" pb={0}>
      <Flex align="center" h="1.5rem">
        <Skeleton h={16} w="40%" radius="xs" mr="auto" />
        {onClose && (
          <ActionIcon variant="subtle" onClick={onClose} aria-label={t`Close`}>
            <Icon name="close" />
          </ActionIcon>
        )}
      </Flex>
    </Box>
  );
}

function ModalButtonsSkeleton({ hasPadding }: { hasPadding?: boolean }) {
  return (
    <ModalFooter hasPadding={hasPadding}>
      <Skeleton h={BUTTON_HEIGHT} w={80} radius="sm" />
      <Skeleton h={BUTTON_HEIGHT} w={80} radius="sm" />
    </ModalFooter>
  );
}

function EventFormSkeleton() {
  return <FormSkeleton fields={EVENT_FORM_FIELDS} withSubmit />;
}

function TimelineFormSkeleton() {
  return <FormSkeleton fields={TIMELINE_FORM_FIELDS} withSubmit />;
}

export function DeleteModalSkeleton({ onClose }: ModalSkeletonProps) {
  return (
    <Box>
      <ModalHeaderSkeleton onClose={onClose} />
      <ModalButtonsSkeleton hasPadding />
    </Box>
  );
}

export function NewEventModalSkeleton({ onClose }: ModalSkeletonProps) {
  return (
    <ModalContent title={t`New event`} onClose={onClose}>
      <EventFormSkeleton />
    </ModalContent>
  );
}

export function EditEventModalSkeleton({ onClose }: ModalSkeletonProps) {
  return (
    <Box>
      <ModalHeader title={t`Edit event`} onClose={onClose} />
      <ModalBody>
        <EventFormSkeleton />
      </ModalBody>
    </Box>
  );
}

export function NewTimelineModalSkeleton({ onClose }: ModalSkeletonProps) {
  return (
    <ModalContent title={t`New event timeline`} onClose={onClose}>
      <TimelineFormSkeleton />
    </ModalContent>
  );
}

export function EditTimelineModalSkeleton({ onClose }: ModalSkeletonProps) {
  return (
    <Box>
      <ModalHeader title={t`Edit event timeline`} onClose={onClose} />
      <ModalBody>
        <TimelineFormSkeleton />
      </ModalBody>
    </Box>
  );
}

type TimelineRowSkeletonProps = {
  index: number;
  iconSize: number;
  withBorder?: boolean;
};

function TimelineRowSkeleton({
  index,
  iconSize,
  withBorder,
}: TimelineRowSkeletonProps) {
  return (
    <Flex
      align="center"
      gap="lg"
      p={withBorder ? "1.75rem" : "lg"}
      bdrs="xs"
      bd={withBorder ? "1px solid var(--mb-color-border-neutral)" : undefined}
    >
      <Skeleton h={iconSize} w={iconSize} circle flex="none" />
      <Stack gap="sm" flex={1}>
        <Skeleton h={14} w={getSkeletonLineWidth(index)} radius="xs" />
        <Skeleton h={10} w={getSkeletonLineWidth(index + 3)} radius="xs" />
      </Stack>
      <Skeleton h={12} w={56} radius="xs" flex="none" />
    </Flex>
  );
}

/** Stands in for `MoveEventModal`: a list of timelines to pick from. */
export function MoveEventModalSkeleton({ onClose }: ModalSkeletonProps) {
  return (
    <Stack gap={0} mih="36rem" mah="90vh">
      <ModalHeaderSkeleton onClose={onClose} />
      <Stack gap="sm" flex="1 1 auto" my="lg" py="lg" px="xxl">
        {Array.from({ length: 3 }, (_, index) => (
          <TimelineRowSkeleton key={index} index={index} iconSize={32} />
        ))}
      </Stack>
      <ModalButtonsSkeleton />
    </Stack>
  );
}

/** Stands in for `TimelineListModal`: a collection's timeline cards. */
export function TimelineListModalSkeleton({ onClose }: ModalSkeletonProps) {
  return (
    <Flex direction="column" mih={MODAL_MIN_HEIGHT}>
      <ModalHeaderSkeleton onClose={onClose} />
      <Stack gap="1.25rem" mt="lg" pt="lg" px="xxl" pb="xxl">
        {Array.from({ length: 3 }, (_, index) => (
          <TimelineRowSkeleton
            key={index}
            index={index}
            iconSize={22}
            withBorder
          />
        ))}
      </Stack>
    </Flex>
  );
}

function EventRowSkeleton({ index }: { index: number }) {
  return (
    <Flex mih="5rem">
      <Skeleton h={32} w={32} circle flex="none" />
      <Stack gap="xs" flex={1} pt="xxs" px="md" pb="sm">
        <Skeleton h={10} w={96} radius="xs" />
        <Skeleton h={14} w={getSkeletonLineWidth(index)} radius="xs" />
        <Skeleton h={10} w={getSkeletonLineWidth(index + 3)} radius="xs" />
      </Stack>
    </Flex>
  );
}

/** Stands in for `TimelineDetailsModal`: a search bar over a timeline's events. */
export function TimelineDetailsModalSkeleton({ onClose }: ModalSkeletonProps) {
  return (
    <Flex direction="column" mih={MODAL_MIN_HEIGHT}>
      <ModalHeaderSkeleton onClose={onClose} />
      <Flex pt="lg" px="xxl" gap="lg">
        <Skeleton h={BUTTON_HEIGHT} flex={1} radius="sm" />
        <Skeleton h={BUTTON_HEIGHT} w={120} radius="sm" />
      </Flex>
      <Stack gap={0} mt="lg" pt="lg" px="xxl" pb="xxl">
        {Array.from({ length: 4 }, (_, index) => (
          <EventRowSkeleton key={index} index={index} />
        ))}
      </Stack>
    </Flex>
  );
}

function PanelEventRowSkeleton({ index }: { index: number }) {
  return (
    <Flex py="xxs" px="md" gap="xxxs">
      <Flex w="2rem" h="2rem" justify="center" align="center" flex="none">
        <Skeleton h={16} w={16} radius="xs" />
      </Flex>
      <Stack gap="xs" flex={1} pt="sm" pr="md">
        <Skeleton h={12} w={getSkeletonLineWidth(index)} radius="xs" />
        <Skeleton h={10} w={88} radius="xs" />
      </Stack>
    </Flex>
  );
}

/** Stands in for the timeline sidebar's panel: a create button over an expanded timeline. */
export function TimelinePanelSkeleton() {
  return (
    <Box mx="xl">
      <Skeleton h={BUTTON_HEIGHT} w={120} radius="sm" mb="lg" />
      <Flex align="center" gap="sm" h="1.5rem">
        <Skeleton h={16} w={16} radius="xs" flex="none" />
        <Skeleton h={14} w="50%" radius="xs" />
      </Flex>
      <Box my="lg" mx="-xl">
        {Array.from({ length: 3 }, (_, index) => (
          <PanelEventRowSkeleton key={index} index={index} />
        ))}
      </Box>
    </Box>
  );
}
