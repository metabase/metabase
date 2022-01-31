import React, { KeyboardEvent, useCallback, useMemo, useState } from "react";
import { jt, t } from "ttag";
import _ from "underscore";
import { getEngineLogo } from "metabase/lib/engine";
import Settings from "metabase/lib/settings";
import TextInput from "metabase/components/TextInput";
import ExternalLink from "metabase/core/components/ExternalLink";
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
} from "./EngineWidget.styled";
import { EngineField, EngineOption } from "./types";

const DEFAULT_OPTIONS_COUNT = 6;

export interface EngineWidget {
  field: EngineField;
  options: EngineOption[];
  isHosted?: boolean;
}

const EngineWidget = ({
  field,
  options,
  isHosted,
}: EngineWidget): JSX.Element => {
  if (field.value) {
    return <EngineButton field={field} options={options} />;
  } else {
    return <EngineSearch field={field} options={options} isHosted={isHosted} />;
  }
};

interface EngineButtonProps {
  field: EngineField;
  options: EngineOption[];
}

const EngineButton = ({ field, options }: EngineButtonProps): JSX.Element => {
  const option = options.find(option => option.value === field.value);

  const handleClick = useCallback(() => {
    field.onChange?.(undefined);
  }, [field]);

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
      {option ? option.name : field.value}
    </EngineButtonRoot>
  );
};

interface EngineSearchProps {
  field: EngineField;
  options: EngineOption[];
  isHosted?: boolean;
}

const EngineSearch = ({
  field,
  options,
  isHosted,
}: EngineSearchProps): JSX.Element => {
  const rootId = useMemo(() => _.uniqueId(), []);
  const [searchText, setSearchText] = useState("");
  const [activeIndex, setActiveIndex] = useState<number>();
  const [isExpanded, setIsExpanded] = useState(false);
  const isSearching = searchText.length > 0;
  const isNavigating = activeIndex != null;
  const hasMoreOptions = options.length > DEFAULT_OPTIONS_COUNT;

  const sortedOptions = useMemo(() => {
    return getSortedOptions(options);
  }, [options]);

  const visibleOptions = useMemo(
    () => getVisibleOptions(sortedOptions, isExpanded, isSearching, searchText),
    [sortedOptions, isExpanded, isSearching, searchText],
  );

  const optionCount = visibleOptions.length;
  const activeOption = isNavigating ? visibleOptions[activeIndex] : undefined;

  const handleSearch = useCallback((value: string) => {
    setSearchText(value);
    setActiveIndex(undefined);
  }, []);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      switch (event.key) {
        case "Enter":
          activeOption && field.onChange?.(activeOption.value);
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
    [field, activeIndex, activeOption, optionCount],
  );

  return (
    <EngineSearchRoot role="combobox" aria-expanded="true">
      <TextInput
        value={searchText}
        placeholder={t`Search for a database…`}
        autoFocus
        aria-autocomplete="list"
        aria-controls={getListBoxId(rootId)}
        aria-activedescendant={getListOptionId(rootId, activeOption)}
        onChange={handleSearch}
        onKeyDown={handleKeyDown}
      />
      {visibleOptions.length ? (
        <EngineList
          rootId={rootId}
          options={visibleOptions}
          activeIndex={activeIndex}
          onOptionChange={field.onChange}
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
            href={Settings.docsUrl("developers-guide-drivers")}
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

const getSortedOptions = (options: EngineOption[]): EngineOption[] => {
  return options.sort((a, b) => {
    if (a.index >= 0 && b.index >= 0) {
      return a.index - b.index;
    } else if (a.index >= 0) {
      return -1;
    } else if (b.index >= 0) {
      return 1;
    } else {
      return a.name.localeCompare(b.name);
    }
  });
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

export default EngineWidget;
