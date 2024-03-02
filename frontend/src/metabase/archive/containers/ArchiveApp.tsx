import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { useSearchListQuery } from "metabase/common/hooks";
import { ArchivedItem } from "metabase/components/ArchivedItem/ArchivedItem";
import BulkActionBar from "metabase/components/BulkActionBar";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper/LoadingAndErrorWrapper";
import { StackedCheckBox } from "metabase/components/StackedCheckBox";
import { VirtualizedList } from "metabase/components/VirtualizedList";
import PageHeading from "metabase/components/type/PageHeading";
import Search from "metabase/entities/search";
import { useListSelect } from "metabase/hooks/use-list-select";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { getIsNavbarOpen } from "metabase/selectors/app";
import { Button } from "metabase/ui";
import type { CollectionItem } from "metabase-types/api";

import {
  ArchiveBarContent,
  ArchiveBarText,
  ArchiveBody,
  ArchiveEmptyState,
  ArchiveHeader,
  ArchiveRoot,
  VirtualizedListWrapper,
  CardWithMaxWidth,
} from "./ArchiveApp.styled";

export function ArchiveApp() {
  const dispatch = useDispatch();
  const isNavbarOpen = useSelector(getIsNavbarOpen);

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
                onUnarchive={() => {
                  dispatch(Search.actions.setArchived(item, false));
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
      <BulkActionBar isNavbarOpen={isNavbarOpen} showing={selected.length > 0}>
        <ArchiveBarContent>
          <SelectionControls
            allSelected={allSelected}
            selectAll={selectAllItems}
            clear={clear}
          />
          <BulkActionControls selected={selected} />
          <ArchiveBarText>{t`${selected.length} items selected`}</ArchiveBarText>
        </ArchiveBarContent>
      </BulkActionBar>
    </ArchiveRoot>
  );
}

const BulkActionControls = ({ selected }: { selected: any[] }) => {
  const dispatch = useDispatch();

  return (
    <span>
      <Button
        variant="default"
        size="sm"
        ml="1rem"
        onClick={() =>
          selected.forEach(item =>
            dispatch(Search.actions.setArchived(item, false)),
          )
        }
      >{t`Unarchive`}</Button>
      <Button
        variant="default"
        ml="0.5rem"
        onClick={() =>
          selected.forEach(item => dispatch(Search.actions.delete(item)))
        }
      >{t`Delete`}</Button>
    </span>
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
    <StackedCheckBox
      ariaLabel="bulk-actions-input"
      checked={true}
      onChange={clear}
    />
  ) : (
    <StackedCheckBox
      ariaLabel="bulk-actions-input"
      checked={false}
      onChange={selectAll}
    />
  );
