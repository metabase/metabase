import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { useSearchListQuery } from "metabase/common/hooks";
import { ArchivedItem } from "metabase/components/ArchivedItem/ArchivedItem";
import {
  BulkActionBar,
  BulkActionButton,
} from "metabase/components/BulkActionBar";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper/LoadingAndErrorWrapper";
import { VirtualizedList } from "metabase/components/VirtualizedList";
import PageHeading from "metabase/components/type/PageHeading";
import Bookmarks from "metabase/entities/bookmarks";
import Search from "metabase/entities/search";
import { useListSelect } from "metabase/hooks/use-list-select";
import { useDispatch } from "metabase/lib/redux";
import type { CollectionItem } from "metabase-types/api";

import {
  ArchiveBarContent,
  ArchiveBody,
  ArchiveEmptyState,
  ArchiveHeader,
  ArchiveRoot,
  VirtualizedListWrapper,
  CardWithMaxWidth,
} from "./ArchiveApp.styled";

export function ArchiveApp() {
  const dispatch = useDispatch();

  const { data, isLoading, error } = useSearchListQuery({
    query: { archived: true },
  });

  const { clear, getIsSelected, selected, selectOnlyTheseItems, toggleItem } =
    useListSelect<CollectionItem>(item => `${item.model}:${item.id}`);

  const list = useMemo(() => {
    clear(); // clear selected items if data is ever refreshed

    if (!Array.isArray(data)) {
      return [];
    }

    return data;
  }, [clear, data]);

  const selectAllItems = useCallback(() => {
    selectOnlyTheseItems(list);
  }, [list, selectOnlyTheseItems]);

  const allSelected = useMemo(
    () => selected.length === list.length,
    [selected, list],
  );

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <ArchiveRoot>
      <ArchiveHeader>
        <PageHeading>{t`Archive`}</PageHeading>
      </ArchiveHeader>
      <ArchiveBody data-testid="archived-list">
        {list.length > 0 ? (
          <VirtualizedList
            Wrapper={({ children, ...props }) => (
              <VirtualizedListWrapper {...props}>
                <CardWithMaxWidth>{children}</CardWithMaxWidth>
              </VirtualizedListWrapper>
            )}
          >
            {list.map(item => (
              <ArchivedItem
                key={item.id}
                model={item.model ?? ""}
                name={Search.objectSelectors.getName(item)}
                icon={Search.objectSelectors.getIcon(item).name}
                color={Search.objectSelectors.getColor(item)}
                onUnarchive={async () => {
                  await dispatch(Search.actions.setArchived(item, false));
                  await dispatch(Bookmarks.actions.invalidateLists());
                }}
                onDelete={() => {
                  dispatch(Search.actions.delete(item));
                }}
                selected={getIsSelected(item)}
                onToggleSelected={() => toggleItem(item)}
                showSelect={selected.length > 0}
              />
            ))}
          </VirtualizedList>
        ) : (
          <VirtualizedListWrapper>
            <CardWithMaxWidth>
              <ArchiveEmptyState>
                <h2>{t`Items you archive will appear here.`}</h2>
              </ArchiveEmptyState>
            </CardWithMaxWidth>
          </VirtualizedListWrapper>
        )}
      </ArchiveBody>
      <BulkActionBar
        opened={selected.length > 0}
        message={t`${selected.length} items selected`}
      >
        <ArchiveBarContent>
          <SelectionControls
            allSelected={allSelected}
            selectAll={selectAllItems}
            clear={clear}
          />
          <BulkActionControls selected={selected} />
        </ArchiveBarContent>
      </BulkActionBar>
    </ArchiveRoot>
  );
}

const BulkActionControls = ({ selected }: { selected: any[] }) => {
  const dispatch = useDispatch();

  return (
    <>
      <BulkActionButton
        size="sm"
        ml="0.5rem"
        onClick={async () => {
          await Promise.all(
            selected.map(item =>
              dispatch(Search.actions.setArchived(item, false)),
            ),
          );
          await dispatch(Bookmarks.actions.invalidateLists());
        }}
      >{t`Unarchive`}</BulkActionButton>
      <BulkActionButton
        ml="0.5rem"
        onClick={() =>
          selected.forEach(item => dispatch(Search.actions.delete(item)))
        }
      >{t`Delete`}</BulkActionButton>
    </>
  );
};

const SelectionControls = ({
  allSelected,
  selectAll,
  clear,
}: {
  allSelected: boolean;
  selectAll: () => void;
  clear: () => void;
}) =>
  allSelected ? (
    <BulkActionButton
      aria-label="bulk-actions-input"
      onClick={clear}
    >{t`Clear selection`}</BulkActionButton>
  ) : (
    <BulkActionButton
      aria-label="bulk-actions-input"
      onClick={selectAll}
    >{t`Select all`}</BulkActionButton>
  );
