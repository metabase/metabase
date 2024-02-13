import { useCallback, useEffect, useMemo } from "react";
import { t } from "ttag";

import type { CollectionItem } from "metabase-types/api";

import { useDispatch, useSelector } from "metabase/lib/redux";

import Search from "metabase/entities/search";
import { useListSelect } from "metabase/hooks/use-list-select";
import { useSearchListQuery } from "metabase/common/hooks";
import { isSmallScreen, getMainElement } from "metabase/lib/dom";

import { openNavbar } from "metabase/redux/app";
import { getIsNavbarOpen } from "metabase/selectors/app";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper/LoadingAndErrorWrapper";
import { Button } from "metabase/ui";
import BulkActionBar from "metabase/components/BulkActionBar";
import Card from "metabase/components/Card";
import PageHeading from "metabase/components/type/PageHeading";
import { StackedCheckBox } from "metabase/components/StackedCheckBox";
import VirtualizedList from "metabase/components/VirtualizedList";
import { ArchivedItem } from "metabase/components/ArchivedItem/ArchivedItem";

import {
  ArchiveBarContent,
  ArchiveBarText,
  ArchiveBody,
  ArchiveEmptyState,
  ArchiveHeader,
  ArchiveRoot,
} from "./ArchiveApp.styled";

const ROW_HEIGHT = 68;

export function ArchiveApp() {
  const dispatch = useDispatch();
  const isNavbarOpen = useSelector(getIsNavbarOpen);
  const mainElement = getMainElement();

  useEffect(() => {
    if (!isSmallScreen()) {
      openNavbar();
    }
  }, []);

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
        <Card
          style={{
            height: list.length > 0 ? ROW_HEIGHT * list.length : "auto",
          }}
        >
          {list.length > 0 ? (
            <VirtualizedList
              scrollElement={mainElement}
              items={list}
              rowHeight={ROW_HEIGHT}
              renderItem={({ item }: { item: CollectionItem }) => (
                <ArchivedItem
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
              )}
            />
          ) : (
            <ArchiveEmptyState>
              <h2>{t`Items you archive will appear here.`}</h2>
            </ArchiveEmptyState>
          )}
        </Card>
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
