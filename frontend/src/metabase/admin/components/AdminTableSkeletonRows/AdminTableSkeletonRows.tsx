import { getSkeletonLineWidth } from "metabase/common/components/Skeletons";
import { Flex, Skeleton } from "metabase/ui";

type AdminTableSkeletonRowsProps = {
  rowCount: number;
  columnCount: number;
  /** Adds a round avatar placeholder before the text in the first column. */
  withAvatar?: boolean;
};

/**
 * Placeholder `<tr>` rows for a plain admin `<table>`, so the real header
 * stays in place while the body loads. Wrap the table in a `LoadingSkeleton`.
 */
export function AdminTableSkeletonRows({
  rowCount,
  columnCount,
  withAvatar = false,
}: AdminTableSkeletonRowsProps) {
  return (
    <>
      {Array.from({ length: rowCount }, (_, rowIndex) => (
        <tr key={rowIndex}>
          {Array.from({ length: columnCount }, (_, columnIndex) => (
            <td key={columnIndex}>
              <Flex align="center" gap="md">
                {withAvatar && columnIndex === 0 && (
                  <Skeleton circle h="3em" w="3em" flex="none" />
                )}
                <Skeleton
                  h={12}
                  w={getSkeletonLineWidth(rowIndex + columnIndex)}
                  miw={40}
                  radius="xs"
                />
              </Flex>
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
