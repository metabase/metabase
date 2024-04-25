import type { ChangeEvent, KeyboardEvent } from "react";
import { useCallback, useMemo, useState } from "react";
import { jt, t } from "ttag";

import ExternalLink from "metabase/core/components/ExternalLink";
import Input from "metabase/core/components/Input";
import { useUniqueId } from "metabase/hooks/use-unique-id";
import MetabaseSettings from "metabase/lib/settings";

import type { EngineOption } from "../../types";
import { getEngineLogo } from "../../utils/engine";

import {
  EngineButtonRoot,
  EngineCardIcon,
  EngineCardImage,
  EngineCardRoot,
  EngineCardTitle,
  EngineEmptyIcon,
  EngineEmptyStateRoot,
  EngineEmptyText,
  EngineListRoot,
  EngineSearchRoot,
  EngineToggleRoot,
} from "./DatabaseEngineWidget.styled";

const DEFAULT_OPTIONS_COUNT = 6;

export interface DatabaseEngineWidgetProps {
  engineKey: string | undefined;
  options: EngineOption[];
  onChange: (engineKey: string | undefined) => void;
  isHosted: boolean;
}

const DatabaseEngineWidget = ({
  engineKey,
  options,
  onChange,
  isHosted,
}: DatabaseEngineWidgetProps): JSX.Element => {
  if (engineKey) {
    return (
      <EngineButton
        engineKey={engineKey}
        options={options}
        onChange={onChange}
      />
    );
  } else {
    return (
      <EngineSearch options={options} isHosted={isHosted} onChange={onChange} />
    );
  }
};

interface EngineButtonProps {
  engineKey: string | undefined;
  options: EngineOption[];
  onChange: (engineKey: string | undefined) => void;
}

const EngineButton = ({
  engineKey,
  options,
  onChange,
}: EngineButtonProps): JSX.Element => {
  const option = options.find(option => option.value === engineKey);

  const handleClick = useCallback(() => {
    onChange(undefined);
  }, [onChange]);

  return (
    <EngineButtonRoot
      type="button"
      primary
      autoFocus
      fullWidth
      iconRight="close"
      aria-label={t`Remove database`}
      onClick={handleClick}
    >
      {option ? option.name : engineKey}
    </EngineButtonRoot>
  );
};

interface EngineSearchProps {
  options: EngineOption[];
  isHosted: boolean;
  onChange: (engineKey: string | undefined) => void;
}

const EngineSearch = ({
  options,
  isHosted,
  onChange,
}: EngineSearchProps): JSX.Element => {
  const rootId = useUniqueId();
  const [searchText, setSearchText] = useState("");
  const [activeIndex, setActiveIndex] = useState<number>();
  const [isExpanded, setIsExpanded] = useState(false);
  const isSearching = searchText.length > 0;
  const isNavigating = activeIndex != null;
  const hasMoreOptions = options.length > DEFAULT_OPTIONS_COUNT;

  const visibleOptions = useMemo(
    () => getVisibleOptions(options, isExpanded, isSearching, searchText),
    [options, isExpanded, isSearching, searchText],
  );

  const optionCount = visibleOptions.length;
  const activeOption = isNavigating ? visibleOptions[activeIndex] : undefined;

  const handleSearch = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setSearchText(event.target.value);
    setActiveIndex(undefined);
  }, []);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      switch (event.key) {
        case "Enter":
          activeOption && onChange(activeOption.value);
          event.preventDefault();
          break;
        case "ArrowUp":
        case "ArrowDown":
          setIsExpanded(true);
          setActiveIndex(getActiveIndex(event.key, activeIndex, optionCount));
          event.preventDefault();
          break;
      }
    },
    [activeIndex, activeOption, optionCount, onChange],
  );

  return (
    <EngineSearchRoot role="combobox" aria-expanded="true">
      <Input
        value={searchText}
        placeholder={t`Search for a database…`}
        autoFocus
        aria-autocomplete="list"
        aria-controls={getListBoxId(rootId)}
        aria-activedescendant={getListOptionId(rootId, activeOption)}
        fullWidth
        onChange={handleSearch}
        onKeyDown={handleKeyDown}
      />
      {visibleOptions.length ? (
        <EngineList
          rootId={rootId}
          options={visibleOptions}
          activeIndex={activeIndex}
          onOptionChange={onChange}
        />
      ) : (
        <EngineEmptyState isHosted={isHosted} />
      )}
      {!isSearching && hasMoreOptions && (
        <EngineToggle
          isExpanded={isExpanded}
          onExpandedChange={setIsExpanded}
        />
      )}
    </EngineSearchRoot>
  );
};

interface EngineListProps {
  rootId: string;
  options: EngineOption[];
  activeIndex?: number;
  onOptionChange?: (value: string) => void;
}

const EngineList = ({
  rootId,
  options,
  activeIndex,
  onOptionChange,
}: EngineListProps): JSX.Element => {
  return (
    <EngineListRoot role="listbox" id={getListBoxId(rootId)}>
      {options.map((option, optionIndex) => (
        <EngineCard
          key={option.value}
          rootId={rootId}
          option={option}
          isActive={optionIndex === activeIndex}
          onOptionChange={onOptionChange}
        />
      ))}
    </EngineListRoot>
  );
};

export interface EngineCardProps {
  rootId: string;
  option: EngineOption;
  isActive: boolean;
  onOptionChange?: (value: string) => void;
}

const EngineCard = ({
  rootId,
  option,
  isActive,
  onOptionChange,
}: EngineCardProps): JSX.Element => {
  const logo = getEngineLogo(option.value);

  const handleClick = useCallback(() => {
    onOptionChange?.(option.value);
  }, [option, onOptionChange]);

  return (
    <EngineCardRoot
      role="option"
      id={getListOptionId(rootId, option)}
      isActive={isActive}
      onClick={handleClick}
    >
      {logo ? (
        <EngineCardImage src={logo} />
      ) : (
        <EngineCardIcon name="database" />
      )}
      <EngineCardTitle>{option.name}</EngineCardTitle>
    </EngineCardRoot>
  );
};

interface EngineEmptyStateProps {
  isHosted?: boolean;
}

const EngineEmptyState = ({ isHosted }: EngineEmptyStateProps): JSX.Element => {
  return (
    <EngineEmptyStateRoot>
      <EngineEmptyIcon name="search" size={32} />
      {isHosted ? (
        <EngineEmptyText>{t`Didn’t find anything`}</EngineEmptyText>
      ) : (
        <EngineEmptyText>{jt`Don’t see your database? Check out our ${(
          <ExternalLink
            key="link"
            // eslint-disable-next-line no-unconditional-metabase-links-render -- Metabase setup
            href={MetabaseSettings.docsUrl(
              "developers-guide/partner-and-community-drivers",
            )}
          >
            {t`Community Drivers`}
          </ExternalLink>
        )} page to see if it’s available for self-hosting.`}</EngineEmptyText>
      )}
    </EngineEmptyStateRoot>
  );
};

interface EngineToggleProps {
  isExpanded: boolean;
  onExpandedChange: (isExpanded: boolean) => void;
}

const EngineToggle = ({
  isExpanded,
  onExpandedChange,
}: EngineToggleProps): JSX.Element => {
  const handleClick = useCallback(() => {
    onExpandedChange(!isExpanded);
  }, [isExpanded, onExpandedChange]);

  return (
    <EngineToggleRoot
      primary
      iconRight={isExpanded ? "chevronup" : "chevrondown"}
      onClick={handleClick}
    >
      {isExpanded ? t`Show fewer options` : t`Show more options`}
    </EngineToggleRoot>
  );
};

const getVisibleOptions = (
  options: EngineOption[],
  isExpanded: boolean,
  isSearching: boolean,
  searchText: string,
): EngineOption[] => {
  if (isSearching) {
    return options.filter(e => includesIgnoreCase(e.name, searchText));
  } else if (isExpanded) {
    return options;
  } else {
    return options.slice(0, DEFAULT_OPTIONS_COUNT);
  }
};

const includesIgnoreCase = (
  sourceText: string,
  searchText: string,
): boolean => {
  return sourceText.toLowerCase().includes(searchText.toLowerCase());
};

const getListBoxId = (rootId: string): string => {
  return `${rootId}-listbox`;
};

const getListOptionId = (
  rootId: string,
  option?: EngineOption,
): string | undefined => {
  return option ? `${rootId}-option-${option.value}` : undefined;
};

const getActiveIndex = (
  key: string,
  activeIndex: number | undefined,
  optionCount: number,
): number | undefined => {
  switch (key) {
    case "ArrowDown":
      if (activeIndex != null) {
        return Math.min(activeIndex + 1, optionCount - 1);
      } else {
        return 0;
      }
    case "ArrowUp":
      if (activeIndex != null) {
        return Math.max(activeIndex - 1, 0);
      } else {
        return optionCount;
      }
    default:
      return activeIndex;
  }
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DatabaseEngineWidget;
