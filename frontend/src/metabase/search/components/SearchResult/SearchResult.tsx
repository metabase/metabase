import type { LocationDescriptorObject } from "history";
import { useCallback } from "react";
import { push } from "react-router-redux";
import { useDispatch } from "metabase/lib/redux";
import { PLUGIN_MODERATION } from "metabase/plugins";
import { Group, Text, Stack, Loader, Box, Divider } from "metabase/ui";
import { isSyncCompleted } from "metabase/lib/syncing";

import type { WrappedResult } from "metabase/search/types";
import { InfoText } from "./InfoText";
import { ItemIcon } from "./components";

import { ResultTitle, SearchResultContainer } from "./SearchResult.styled";

export function SearchResult({
  result,
  compact = false,
  showDescription = true,
  onClick = null,
  isSelected = false,
}: {
  result: WrappedResult;
  compact?: boolean;
  showDescription?: boolean;
  onClick?: ((result: WrappedResult) => void) | null;
  isSelected?: boolean;
}) {
  const { name, model, description, moderated_status }: WrappedResult = result;

  const isActive = isItemActive(result);
  const isLoading = isItemLoading(result);

  const dispatch = useDispatch();

  const onChangeLocation = useCallback(
    (nextLocation: LocationDescriptorObject | string) =>
      dispatch(push(nextLocation)),
    [dispatch],
  );

  const handleClick = (e) => {
    e.preventDefault();

    if (!isActive) {
      return;
    }

    if (onClick) {
      onClick(result);
      return;
    }

    onChangeLocation(result.getUrl());
  };

  return (
    <SearchResultContainer
      tabIndex={0}
      onClick={handleClick}
      isActive={isActive}
      isSelected={isSelected}
      p="sm"
    >
      <ItemIcon active={isActive} item={result} type={model} />
      <Stack justify="center" spacing={0} style={{ overflow: "hidden" }}>
        <Group spacing="xs" align="center">
          <ResultTitle fw={700} size="md" truncate>
            {name}
          </ResultTitle>
          <PLUGIN_MODERATION.ModerationStatusIcon
            status={moderated_status}
            size={14}
          />
        </Group>
        <InfoText isCompact={compact} result={result} />
      </Stack>
      {isLoading && (
        <Box
          style={{
            gridRow: "1 / span 2",
            gridColumn: 3,
          }}
          px="xs"
        >
          <Loader />
        </Box>
      )}
      {!compact && description && showDescription && (
        <Box
          style={{
            gridColumnStart: 2,
          }}
        >
          <Group noWrap spacing="sm">
            <Divider
              size="md"
              color="focus.0"
              orientation="vertical"
              style={{ borderRadius: "0.25rem" }}
            />
            <Text lineClamp={3}>{description}</Text>
          </Group>
        </Box>
      )}
    </SearchResultContainer>
  );
}

const isItemActive = (result: WrappedResult) => {
  if (result.model !== "table") {
    return true;
  }

  return isSyncCompleted(result);
};

const isItemLoading = (result: WrappedResult) => {
  if (result.model !== "database" && result.model !== "table") {
    return false;
  }

  return !isSyncCompleted(result);
};
