import cx from "classnames";
import { t } from "ttag";

import { getSkeletonLineWidth } from "metabase/common/components/Skeletons";
import CS from "metabase/css/core/index.css";
import { Box, Card, Flex, Skeleton, Stack } from "metabase/ui";

import DetailS from "./Detail.module.css";
import F from "./Field.module.css";
import ListS from "./List/List.module.css";

// These layouts aren't wrapped in a `LoadingSkeleton`: they're passed to a
// `LoadingAndErrorWrapper`'s `loader`, which adds it.

const LIST_ITEMS_COUNT = 5;
const FIELD_ROWS_COUNT = 8;
const REVISIONS_COUNT = 3;

/** The cards of a reference list page: databases, tables, segments, questions. */
export const ReferenceListSkeleton = () => (
  <Box className={cx(CS.wrapper, CS.wrapperTrim)}>
    <Stack component="ul" className={ListS.list} gap={0}>
      {Array.from({ length: LIST_ITEMS_COUNT }, (_, index) => (
        <Card
          key={index}
          component="li"
          p="xl"
          mb="lg"
          w="680px"
          maw="100%"
          radius="sm"
          withBorder
        >
          <Flex gap="sm">
            <Skeleton h={16} w={16} radius="xs" flex="none" mt={4} />
            <Stack gap="sm" flex={1}>
              <Flex align="center" h={24}>
                <Skeleton h={14} w={getSkeletonLineWidth(index)} radius="xs" />
              </Flex>
              <Skeleton
                h={12}
                w={getSkeletonLineWidth(index + 3)}
                radius="xs"
              />
            </Stack>
          </Flex>
        </Card>
      ))}
    </Stack>
  </Box>
);

/**
 * The bordered box of a reference detail page, with the real detail titles
 * and skeleton text under each.
 */
export const ReferenceDetailSkeleton = ({
  titles,
}: {
  titles: readonly string[];
}) => (
  <Box className={CS.wrapper}>
    <Box
      component="ul"
      pl="2rem"
      pr="1.5rem"
      pt="2rem"
      mb="2rem"
      bg="background_page-primary"
      bdrs="sm"
      bd="1px solid var(--mb-color-border-neutral)"
    >
      {titles.map((title, index) => (
        <li key={title} className={DetailS.detail}>
          <Box className={DetailS.detailBody} w="100%">
            <div className={DetailS.detailTitle}>{title}</div>
            <Flex align="center" h={24} mt={6}>
              <Skeleton
                h={14}
                w={getSkeletonLineWidth(index)}
                maw={600}
                radius="xs"
              />
            </Flex>
          </Box>
        </li>
      ))}
    </Box>
  </Box>
);

/** The field table of a table's or segment's field list page. */
export const ReferenceFieldListSkeleton = () => (
  <Box className={CS.wrapper}>
    <Box
      px="2rem"
      pb="1rem"
      mb="2rem"
      bg="background_page-primary"
      bdrs="sm"
      bd="1px solid var(--mb-color-border-neutral)"
    >
      <Flex py={20}>
        <div className={cx(ListS.itemTitle, F.fieldNameTitle)}>
          {t`Field name`}
        </div>
        <div className={cx(ListS.itemTitle, F.fieldType)}>{t`Field type`}</div>
        <div className={cx(ListS.itemTitle, F.fieldDataType)}>
          {t`Data type`}
        </div>
      </Flex>
      {Array.from({ length: FIELD_ROWS_COUNT }, (_, index) => (
        <Flex
          key={index}
          align="center"
          h="2.5rem"
          style={{ borderTop: "1px solid var(--mb-color-border-neutral)" }}
        >
          <Box className={F.fieldNameTitle}>
            <Skeleton h={12} w={getSkeletonLineWidth(index)} radius="xs" />
          </Box>
          <Flex className={F.fieldType} align="center" gap="sm">
            <Skeleton h={20} w={20} radius="xs" flex="none" />
            <Skeleton h={12} w="50%" radius="xs" />
          </Flex>
          <Box className={F.fieldDataType}>
            <Skeleton h={12} w="40%" radius="xs" />
          </Box>
        </Flex>
      ))}
    </Box>
  </Box>
);

/** The timeline of a segment's revision history page. */
export const ReferenceRevisionsSkeleton = () => (
  <Box className={CS.wrapper}>
    <Stack
      p="1.5rem"
      mb="2rem"
      gap="2rem"
      bg="background_page-primary"
      bd="1px solid var(--mb-color-border-neutral)"
    >
      {Array.from({ length: REVISIONS_COUNT }, (_, index) => (
        <Flex key={index} gap="md">
          <Skeleton h={32} w={32} circle flex="none" />
          <Stack gap="sm" flex={1} pt="xs">
            <Flex justify="space-between" gap="md">
              <Skeleton h={14} w={getSkeletonLineWidth(index)} radius="xs" />
              <Skeleton h={12} w={80} radius="xs" />
            </Flex>
            <Skeleton h={12} w={getSkeletonLineWidth(index + 3)} radius="xs" />
          </Stack>
        </Flex>
      ))}
    </Stack>
  </Box>
);
