import { useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import { FilterPanelPopover } from "metabase/querying/filters/components/FilterPanel/FilterPanelPopover";
import { FilterPill } from "metabase/querying/filters/components/FilterPanel/FilterPill";
import { FilterPicker } from "metabase/querying/filters/components/FilterPicker";
import { ClauseStep } from "metabase/querying/notebook/components/ClauseStep";
import {
  Box,
  Button,
  Divider,
  Group,
  Icon,
  Modal,
  Popover,
  Stack,
  Text,
  UnstyledButton,
} from "metabase/ui";
import * as Lib from "metabase-lib";

import { getFilterLabel } from "../../harness/clauses";
import { clearFilters } from "../../harness/examples";
import type { FilterUiProps } from "../../types";
import { ExpressionBar } from "../expression-bar/ExpressionBar";

type VariantProps = Omit<FilterUiProps, "variant">;

/**
 * Direction B3: today's pills and notebook step. The filter picker gains an
 * "Advanced filter" row that opens the expression bar in a modal; the result
 * is one "Advanced filter" pill that reopens the modal.
 */
export function AdvancedFilterModalPrototype({
  query,
  stageIndex,
  variant,
  onChange,
}: FilterUiProps) {
  if (variant === "chill") {
    return (
      <AdvancedChill
        query={query}
        stageIndex={stageIndex}
        onChange={onChange}
      />
    );
  }

  return (
    <AdvancedNotebook
      query={query}
      stageIndex={stageIndex}
      onChange={onChange}
    />
  );
}

/** An and/or clause is an advanced filter: it gets its own pill and the modal. */
function isAdvanced(
  query: Lib.Query,
  stageIndex: number,
  filter: Lib.FilterClause,
) {
  const { operator } = Lib.expressionParts(query, stageIndex, filter);
  return operator === "and" || operator === "or";
}

/** Which clause the modal edits; `clause` is unset for a new advanced filter. */
type ModalState = { clause?: Lib.FilterClause } | null;

function AdvancedChill({ query, stageIndex, onChange }: VariantProps) {
  const [modal, setModal] = useState<ModalState>(null);
  const filters = Lib.filters(query, stageIndex);

  return (
    <Group gap="sm" align="center" py="sm">
      {filters.map((filter, filterIndex) =>
        isAdvanced(query, stageIndex, filter) ? (
          <FilterPill
            key={filterIndex}
            onClick={() => setModal({ clause: filter })}
            onRemoveClick={() =>
              onChange(Lib.removeClause(query, stageIndex, filter))
            }
          >
            {t`Advanced filter`}
          </FilterPill>
        ) : (
          <FilterPanelPopover
            key={filterIndex}
            query={query}
            stageIndex={stageIndex}
            filter={filter}
            filterIndex={filterIndex}
            onChange={onChange}
          />
        ),
      )}
      {filters.length === 0 && <Text c="text-secondary">{t`No filters`}</Text>}
      <AdvancedFilterModal
        state={modal}
        query={query}
        stageIndex={stageIndex}
        onChange={onChange}
        onClose={() => setModal(null)}
      />
    </Group>
  );
}

/** The chill header's "Filter" button: picker plus the "Advanced filter" row. */
export function AdvancedFilterModalButton({
  query,
  stageIndex,
  onChange,
}: FilterUiProps) {
  const [isOpened, setIsOpened] = useState(false);
  const [modal, setModal] = useState<ModalState>(null);

  return (
    <>
      <Popover
        opened={isOpened}
        position="bottom-end"
        transitionProps={{ duration: 0 }}
        onChange={setIsOpened}
      >
        <Popover.Target>
          <Button
            size="compact-md"
            variant="default"
            leftSection={<Icon name="filter" />}
            onClick={() => setIsOpened((opened) => !opened)}
          >
            {t`Filter`}
          </Button>
        </Popover.Target>
        <Popover.Dropdown>
          <PickerWithAdvanced
            query={query}
            stageIndex={stageIndex}
            onSelect={(filter) => {
              onChange(Lib.filter(query, stageIndex, filter));
              setIsOpened(false);
            }}
            onAdvanced={() => {
              setIsOpened(false);
              setModal({});
            }}
            onClose={() => setIsOpened(false)}
          />
        </Popover.Dropdown>
      </Popover>
      <AdvancedFilterModal
        state={modal}
        query={query}
        stageIndex={stageIndex}
        onChange={onChange}
        onClose={() => setModal(null)}
      />
    </>
  );
}

function AdvancedNotebook({ query, stageIndex, onChange }: VariantProps) {
  const [modal, setModal] = useState<ModalState>(null);
  const filters = Lib.filters(query, stageIndex);

  return (
    <>
      <ClauseStep
        color="core-filter"
        items={filters}
        initialAddText={t`Add filters to narrow your answer`}
        renderName={(filter) =>
          isAdvanced(query, stageIndex, filter)
            ? t`Advanced filter`
            : getFilterLabel(query, stageIndex, filter)
        }
        renderPopover={({ item: filter, index, onClose }) =>
          filter && isAdvanced(query, stageIndex, filter) ? (
            <OpenModal
              onOpen={() => {
                onClose();
                setModal({ clause: filter });
              }}
            />
          ) : filter ? (
            <FilterPicker
              query={query}
              stageIndex={stageIndex}
              filter={filter}
              filterIndex={index}
              onSelect={(newFilter) =>
                onChange(
                  Lib.replaceClause(query, stageIndex, filter, newFilter),
                )
              }
              onClose={onClose}
            />
          ) : (
            <PickerWithAdvanced
              query={query}
              stageIndex={stageIndex}
              onSelect={(newFilter) =>
                onChange(Lib.filter(query, stageIndex, newFilter))
              }
              onAdvanced={() => {
                onClose();
                setModal({});
              }}
              onClose={onClose}
            />
          )
        }
        onRemove={(filter) =>
          onChange(Lib.removeClause(query, stageIndex, filter))
        }
        onReorder={(source, target) =>
          onChange(Lib.swapClauses(query, stageIndex, source, target))
        }
      />
      <AdvancedFilterModal
        state={modal}
        query={query}
        stageIndex={stageIndex}
        onChange={onChange}
        onClose={() => setModal(null)}
      />
    </>
  );
}

/** ClauseStep opens a popover on click; an advanced item swaps it for the modal. */
function OpenModal({ onOpen }: { onOpen: () => void }) {
  useEffect(() => {
    onOpen();
  }, [onOpen]);
  return null;
}

type PickerWithAdvancedProps = {
  query: Lib.Query;
  stageIndex: number;
  onSelect: (filter: Lib.Filterable) => void;
  onAdvanced: () => void;
  onClose: () => void;
};

function PickerWithAdvanced({
  query,
  stageIndex,
  onSelect,
  onAdvanced,
  onClose,
}: PickerWithAdvancedProps) {
  return (
    <Stack gap={0}>
      <FilterPicker
        query={query}
        stageIndex={stageIndex}
        onSelect={onSelect}
        onClose={onClose}
      />
      <Divider />
      <UnstyledButton px="md" py="md" onClick={onAdvanced}>
        <Group gap="sm">
          <Icon name="add" />
          <Text fw="bold">{t`Advanced filter`}</Text>
        </Group>
      </UnstyledButton>
    </Stack>
  );
}

type AdvancedFilterModalProps = VariantProps & {
  state: ModalState;
  onClose: () => void;
};

/**
 * The bar edits a scratch query holding just this clause, so the other pills
 * stay pills. On apply the result folds back into one clause.
 */
function AdvancedFilterModal({
  state,
  query,
  stageIndex,
  onChange,
  onClose,
}: AdvancedFilterModalProps) {
  const clause = state?.clause;
  const scratch = useMemo(() => {
    const cleared = clearFilters(query, stageIndex);
    return clause ? Lib.filter(cleared, stageIndex, clause) : cleared;
  }, [query, stageIndex, clause]);

  const handleChange = (newScratch: Lib.Query) => {
    const filters = Lib.filters(newScratch, stageIndex);
    const combined =
      filters.length > 1 ? Lib.expressionClause("and", filters) : filters.at(0);
    if (clause) {
      onChange(
        combined
          ? Lib.replaceClause(query, stageIndex, clause, combined)
          : Lib.removeClause(query, stageIndex, clause),
      );
    } else if (combined) {
      onChange(Lib.filter(query, stageIndex, combined));
    }
    onClose();
  };

  return (
    <Modal
      opened={state != null}
      size="xl"
      title={t`Advanced filter`}
      // Escape belongs to the bar: it clears text, then reverts the draft.
      closeOnEscape={false}
      onClose={onClose}
    >
      <Text size="sm" c="text-secondary" mb="lg">
        {t`Add filters and type parentheses and logical operators (e.g., and, or)`}
      </Text>
      <Box mih={112}>
        <ExpressionBar
          query={scratch}
          stageIndex={stageIndex}
          onChange={handleChange}
          renderActions={({ canApply, apply, cancel }) => (
            <Group gap="sm">
              <Button
                variant="subtle"
                onClick={() => {
                  cancel();
                  onClose();
                }}
              >
                {t`Cancel`}
              </Button>
              <Button
                variant="filled"
                disabled={!canApply}
                onClick={() => {
                  apply();
                  onClose();
                }}
              >
                {t`Apply`}
              </Button>
            </Group>
          )}
        />
      </Box>
    </Modal>
  );
}
