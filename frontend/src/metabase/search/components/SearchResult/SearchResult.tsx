import type { LocationDescriptorObject } from "history";
import type { MouseEvent } from "react";
import { useCallback } from "react";
import { push } from "react-router-redux";

import { useDispatch } from "metabase/lib/redux";
import { isSyncCompleted } from "metabase/lib/syncing";
import { PLUGIN_MODERATION } from "metabase/plugins";
import { trackSearchClick } from "metabase/search/analytics";
import type { WrappedResult } from "metabase/search/types";
import { Group, Loader, Icon } from "metabase/ui";
import type { SearchContext } from "metabase-types/api";

import { InfoText } from "../InfoText";

import {
  DescriptionDivider,
  DescriptionSection,
  LoadingSection,
  ResultNameSection,
  ResultTitle,
  SearchResultContainer,
  SearchResultDescription,
  XRayButton,
  XRaySection,
} from "./SearchResult.styled";
import { ItemIcon } from "./components";

export function SearchResult({
  result,
  compact = false,
  showDescription = true,
  isSelected = false,
  onClick,
  className,
  index,
  context = "search-app",
}: {
  result: WrappedResult;
  compact?: boolean;
  showDescription?: boolean;
  onClick?: (result: WrappedResult) => void;
  isSelected?: boolean;
  className?: string;
  index: number;
  context?: SearchContext;
}) {
  const { name, model, description, moderated_status }: WrappedResult = result;

  const showXRayButton =
    result.model === "indexed-entity" &&
    result.id !== undefined &&
    result.model_index_id !== null;

  const isActive = isItemActive(result);
  const isLoading = isItemLoading(result);

  const dispatch = useDispatch();

  const onChangeLocation = useCallback(
    (nextLocation: LocationDescriptorObject | string) =>
      dispatch(push(nextLocation)),
    [dispatch],
  );

  const onXRayClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();

    onChangeLocation(
      `/auto/dashboard/model_index/${result.model_index_id}/primary_key/${result.id}`,
    );
  };

  const handleClick = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (!isActive) {
      return;
    }

    if (onClick) {
      onClick(result);
      return;
    }
    trackSearchClick("item", index, context);
    onChangeLocation(result.getUrl());
  };

  return (
    <SearchResultContainer
      className={className}
      data-testid="search-result-item"
      component="button"
      onClick={handleClick}
      isActive={isActive}
      isSelected={isSelected}
      data-model-type={model}
      data-is-selected={isSelected}
      w="100%"
      aria-label={`${name} ${model}`}
    >
      <ItemIcon
        data-testid="search-result-item-icon"
        active={isActive}
        item={result}
        type={model}
      />
      <ResultNameSection justify="center" spacing="xs">
        <Group spacing="xs" align="center" noWrap>
          <ResultTitle
            role="heading"
            data-testid="search-result-item-name"
            truncate
            href={!onClick ? result.getUrl() : undefined}
          >
            {name}
          </ResultTitle>
          <PLUGIN_MODERATION.ModerationStatusIcon
            status={moderated_status}
            filled
            size={14}
          />
        </Group>
        <InfoText showLinks={!onClick} result={result} isCompact={compact} />
        {description && showDescription && (
          <DescriptionSection>
            <Group noWrap spacing="sm" data-testid="result-description">
              <DescriptionDivider
                size="md"
                color="focus"
                orientation="vertical"
              />
              <SearchResultDescription
                dark
                unwrapDisallowed
                unstyleLinks
                allowedElements={[]}
              >
                {description}
              </SearchResultDescription>
            </Group>
          </DescriptionSection>
        )}
      </ResultNameSection>
      {isLoading && (
        <LoadingSection px="xs">
          <Loader />
        </LoadingSection>
      )}
      {showXRayButton && (
        <XRaySection>
          <XRayButton leftIcon={<Icon name="bolt" />} onClick={onXRayClick} />
        </XRaySection>
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
