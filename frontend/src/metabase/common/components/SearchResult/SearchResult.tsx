import cx from "classnames";
import type { LocationDescriptorObject } from "history";
import type { AnchorHTMLAttributes, HTMLAttributes, MouseEvent } from "react";
import { forwardRef, useCallback } from "react";
import { push } from "react-router-redux";

import { Markdown } from "metabase/common/components/Markdown";
import { trackSearchClick } from "metabase/common/search/analytics";
import { PLUGIN_MODERATION } from "metabase/plugins";
import { useDispatch } from "metabase/redux";
import type { AnchorProps, BoxProps, StackProps } from "metabase/ui";
import {
  Anchor,
  Box,
  Button,
  Divider,
  Group,
  Icon,
  Loader,
  Stack,
  rem,
} from "metabase/ui";
import { modelToUrl } from "metabase/urls";
import { isSyncCompleted } from "metabase/utils/syncing";
import type { SearchContext, SearchResult } from "metabase-types/api";

import { InfoText } from "../InfoText";

import S from "./SearchResult.module.css";
import { ItemIcon } from "./components";

// Always a div: the title's stretched link handles navigation, so the row must
// not become an interactive element wrapping other interactive elements.
export const SearchResultContainer = forwardRef<
  HTMLDivElement,
  BoxProps &
    HTMLAttributes<HTMLDivElement> & {
      isActive?: boolean;
      isSelected?: boolean;
    }
>(function SearchResultContainer(
  { className, isActive, isSelected, ...props },
  ref,
) {
  return (
    <Box
      ref={ref}
      p="sm"
      className={cx(
        S.root,
        { [S.active]: isActive, [S.selected]: isActive && isSelected },
        className,
      )}
      {...props}
    />
  );
});

// base color lives in .title so .title:hover, .active:hover .title, and
// .selected .title can override it (a c prop would render an inline style)
export const ResultTitle = ({
  className,
  ...props
}: AnchorProps & AnchorHTMLAttributes<HTMLAnchorElement>) => (
  <Anchor fw={700} fz="md" className={cx(S.title, className)} {...props} />
);

export const ResultNameSection = ({
  className,
  ...props
}: StackProps & HTMLAttributes<HTMLDivElement>) => (
  <Stack className={cx(S.nameSection, className)} {...props} />
);

export const LoadingSection = ({
  className,
  ...props
}: BoxProps & HTMLAttributes<HTMLDivElement>) => (
  <Box className={cx(S.loadingSection, className)} {...props} />
);

export function SearchResult({
  result,
  compact = false,
  showDescription = true,
  isSelected = false,
  onClick,
  className,
  index,
  context = "search-app",
  searchEngine,
  searchRequestId,
  searchTerm,
}: {
  result: SearchResult;
  compact?: boolean;
  showDescription?: boolean;
  onClick?: (result: SearchResult) => void;
  isSelected?: boolean;
  className?: string;
  index: number;
  context?: SearchContext;
  searchEngine?: string;
  searchRequestId?: string;
  searchTerm?: string;
}) {
  const { name, model, description, moderated_status }: SearchResult = result;

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

  // the row navigates via the title's stretched link; gate it on isActive so an
  // item that isn't ready yet (e.g. a still-syncing table) isn't a link at all,
  // which keeps plain, modified, and middle clicks all inert
  const url = isActive && !onClick ? modelToUrl(result) : undefined;

  const trackClick = () => {
    trackSearchClick({
      itemType: "item",
      position: index,
      context,
      searchEngine: searchEngine || "unknown",
      requestId: searchRequestId,
      entityModel: result.model,
      entityId: typeof result.id === "number" ? result.id : null,
      searchTerm,
    });
  };

  const handleClick = (e: MouseEvent) => {
    // let the browser open the result in a new tab/window on a modified click
    // instead of doing an in-app navigation, but still record the open
    if (url && (e.metaKey || e.ctrlKey || e.shiftKey)) {
      e.stopPropagation();
      trackClick();
      return;
    }

    e.stopPropagation();
    e.preventDefault();

    if (!isActive) {
      return;
    }

    if (onClick) {
      onClick(result);
      return;
    }
    trackClick();
    onChangeLocation(modelToUrl(result));
  };

  // attached to the title link (not the row) so a middle-click on a lifted
  // child such as a breadcrumb or the x-ray button doesn't record a result
  // open; onClick never fires for a middle-click, so record the open here
  const handleAuxClick = (e: MouseEvent) => {
    if (e.button === 1 && url) {
      trackClick();
    }
  };

  return (
    <SearchResultContainer
      className={className}
      data-testid="search-result-item"
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
      <ResultNameSection justify="center" gap="xs">
        <Group gap="xs" align="center" wrap="nowrap">
          <ResultTitle
            role="heading"
            data-testid="search-result-item-name"
            truncate
            href={url}
            onAuxClick={handleAuxClick}
          >
            {name}
          </ResultTitle>
          <PLUGIN_MODERATION.ModerationStatusIcon
            status={moderated_status}
            filled
            size={14}
          />
        </Group>
        <Box pos="relative" w="fit-content" maw="100%">
          <InfoText showLinks={!onClick} result={result} isCompact={compact} />
        </Box>
        {description && showDescription && (
          <Box mt="sm">
            <Group wrap="nowrap" gap="sm" data-testid="result-description">
              <Divider
                size="md"
                color="focus"
                orientation="vertical"
                bdrs="xs"
              />
              <Markdown
                dark
                unwrapDisallowed
                unstyleLinks
                allowedElements={[]}
                className={S.description}
              >
                {description}
              </Markdown>
            </Group>
          </Box>
        )}
      </ResultNameSection>
      {isLoading && (
        <LoadingSection px="xs">
          <Loader />
        </LoadingSection>
      )}
      {showXRayButton && (
        <Box className={S.xraySection} pos="relative">
          <Button
            w={rem(32)}
            h={rem(32)}
            leftSection={<Icon name="bolt" />}
            onClick={onXRayClick}
          />
        </Box>
      )}
    </SearchResultContainer>
  );
}

const isItemActive = (result: SearchResult) => {
  if (result.model !== "table") {
    return true;
  }

  return isSyncCompleted(result);
};

const isItemLoading = (result: SearchResult) => {
  if (result.model !== "database" && result.model !== "table") {
    return false;
  }

  return !isSyncCompleted(result);
};
