import cx from "classnames";
import { useMemo, useState } from "react";
import { t } from "ttag";

import { EmptyState } from "metabase/common/components/EmptyState";
import { Subhead } from "metabase/common/components/type/Subhead";
import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import CS from "metabase/css/core/index.css";
import {
  type PermissionEditorBreadcrumb,
  type PermissionEditorType,
  PermissionsTable,
  type PermissionsTableProps,
} from "metabase/permissions";
import { Box, Flex, Icon, Input, Text, TextInput } from "metabase/ui";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/utils/constants";

import S from "./PermissionsEditor.module.css";
import { PermissionsEditorBreadcrumbs } from "./PermissionsEditorBreadcrumbs";

export type PermissionsEditorContentProps = PermissionEditorType &
  Pick<PermissionsTableProps, "onChange" | "onSelect" | "onAction"> & {
    onBreadcrumbsItemSelect?: (item: PermissionEditorBreadcrumb) => void;
    postHeaderContent?: React.FC;
    preHeaderContent?: React.FC;
  };

export function PermissionsEditorContent({
  title,
  description,
  entities,
  columns,
  filterPlaceholder,
  breadcrumbs,
  onBreadcrumbsItemSelect,
  onChange,
  onSelect,
  onAction,
  postHeaderContent: PostHeaderContent = () => null,
  preHeaderContent: PreHeaderContent = () => null,
}: PermissionsEditorContentProps) {
  const [filter, setFilter] = useState("");
  //this needs to be state to trigger a rerender when it's set
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(
    null,
  );

  const debouncedFilter = useDebouncedValue(filter, SEARCH_DEBOUNCE_DURATION);

  const filteredEntities = useMemo(() => {
    const trimmedFilter = debouncedFilter.trim().toLowerCase();

    if (trimmedFilter.length === 0) {
      return null;
    }

    return entities.filter((entity) =>
      entity.name.toLowerCase().includes(trimmedFilter),
    );
  }, [entities, debouncedFilter]);

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setFilter(e.target.value);

  return (
    <Flex direction="column" pl="xxl" h="100%" data-testid="permissions-editor">
      <PreHeaderContent />
      <Subhead data-testid="permissions-editor-breadcrumbs">
        {title}{" "}
        {breadcrumbs && onBreadcrumbsItemSelect && (
          <PermissionsEditorBreadcrumbs
            items={breadcrumbs}
            onBreadcrumbsItemSelect={onBreadcrumbsItemSelect}
          />
        )}
      </Subhead>

      {description && <Text lh="normal">{description}</Text>}

      <PostHeaderContent />

      <TextInput
        mt="lg"
        mb="sm"
        // Full width, with right padding matching the editor's left padding.
        w="100%"
        pr="xxl"
        placeholder={filterPlaceholder}
        onChange={handleFilterChange}
        value={filter}
        leftSection={<Icon name="search" />}
        rightSectionPointerEvents="all"
        rightSection={
          filter.length > 0 ? (
            <Input.ClearButton
              c="text-secondary"
              onClick={() => setFilter("")}
            />
          ) : null
        }
      />

      {/* Bleeds through the editor's left padding so the grid and its row
          dividers run edge to edge; `tableScroll` pads the first column back. */}
      <Box
        ref={setScrollElement}
        className={cx(CS.overflowAuto, S.tableScroll)}
        flex={1}
        pb="xxl"
        ml="calc(var(--mantine-spacing-xxl) * -1)"
      >
        <PermissionsTable
          entities={filteredEntities || entities}
          columns={columns}
          onSelect={onSelect}
          onChange={onChange}
          onAction={onAction}
          scrollElement={scrollElement}
          emptyState={
            <Box mt="7.5rem">
              <EmptyState message={t`Nothing here`} icon="folder" />
            </Box>
          }
        />
      </Box>
    </Flex>
  );
}
