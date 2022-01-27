import React, { KeyboardEvent, useCallback, useMemo, useState } from "react";
import { jt, t } from "ttag";
import { getEngineLogo } from "metabase/lib/engine";
import Settings from "metabase/lib/settings";
import TextInput from "metabase/components/TextInput";
import ExternalLink from "metabase/core/components/ExternalLink";
import {
  EngineButtonIcon,
  EngineButtonRoot,
  EngineButtonTitle,
  EngineCardIcon,
  EngineCardImage,
  EngineCardRoot,
  EngineCardTitle,
  EngineEmptyIcon,
  EngineEmptyStateRoot,
  EngineEmptyText,
  EngineListRoot,
  EngineSearchRoot,
} from "./EngineWidget.styled";
import { EngineField, EngineOption } from "./types";

export interface EngineWidget {
  field: EngineField;
  options: EngineOption[];
  isHosted: boolean;
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
    <EngineButtonRoot autoFocus onClick={handleClick}>
      <EngineButtonTitle>
        {option ? option.name : field.value}
      </EngineButtonTitle>
      <EngineButtonIcon
        name="close"
        size={18}
        aria-label={t`Remove database`}
      />
    </EngineButtonRoot>
  );
};

interface EngineSearchProps {
  field: EngineField;
  options: EngineOption[];
  isHosted: boolean;
}

const EngineSearch = ({
  field,
  options,
  isHosted,
}: EngineSearchProps): JSX.Element => {
  const [searchText, setSearchText] = useState("");
  const [activeIndex, setActiveIndex] = useState<number>();
  const isSearching = searchText.length > 0;

  const sortedOptions = useMemo(() => {
    return getSortedOptions(options);
  }, [options]);

  const visibleOptions = useMemo(
    () => getVisibleOptions(sortedOptions, isSearching, searchText),
    [sortedOptions, isSearching, searchText],
  );

  const handleSearch = useCallback((value: string) => {
    setSearchText(value);
    setActiveIndex(undefined);
  }, []);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const optionCount = visibleOptions.length;
      const activeOption = activeIndex != null && visibleOptions[activeIndex];

      switch (event.key) {
        case "Enter":
          activeOption && field.onChange?.(activeOption.value);
          break;
        case "ArrowUp":
        case "ArrowDown":
          setActiveIndex(getActiveIndex(event.key, activeIndex, optionCount));
          break;
      }
    },
    [field, visibleOptions, activeIndex],
  );

  return (
    <EngineSearchRoot role="combobox" aria-expanded="true">
      <TextInput
        value={searchText}
        placeholder={t`Search for a database…`}
        autoFocus
        aria-autocomplete="list"
        onChange={handleSearch}
        onKeyDown={handleKeyDown}
      />
      {visibleOptions.length ? (
        <EngineList
          options={visibleOptions}
          activeIndex={activeIndex}
          onOptionChange={field.onChange}
        />
      ) : (
        <EngineEmptyState isHosted={isHosted} />
      )}
    </EngineSearchRoot>
  );
};

interface EngineListProps {
  options: EngineOption[];
  activeIndex?: number;
  onOptionChange?: (value: string) => void;
}

const EngineList = ({
  options,
  activeIndex,
  onOptionChange,
}: EngineListProps): JSX.Element => {
  return (
    <EngineListRoot role="listbox">
      {options.map((option, optionIndex) => (
        <EngineCard
          key={option.value}
          option={option}
          isActive={optionIndex === activeIndex}
          onOptionChange={onOptionChange}
        />
      ))}
    </EngineListRoot>
  );
};

export interface EngineCardProps {
  option: EngineOption;
  isActive: boolean;
  onOptionChange?: (value: string) => void;
}

const EngineCard = ({
  option,
  isActive,
  onOptionChange,
}: EngineCardProps): JSX.Element => {
  const logo = getEngineLogo(option.value);

  const handleClick = useCallback(() => {
    onOptionChange?.(option.value);
  }, [option, onOptionChange]);

  return (
    <EngineCardRoot role="option" isActive={isActive} onClick={handleClick}>
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
  isHosted: boolean;
}

const EngineEmptyState = ({ isHosted }: EngineEmptyStateProps): JSX.Element => {
  return (
    <EngineEmptyStateRoot>
      <EngineEmptyIcon name="search" size={32} />
      {isHosted ? (
        <EngineEmptyText>{t`Didn’t find anything`}</EngineEmptyText>
      ) : (
        <EngineEmptyText>{jt`Don’t see your database? Check out our ${(
          <ExternalLink href={Settings.docsUrl("developers-guide-drivers")}>
            {t`Community Drivers`}
          </ExternalLink>
        )} page to see if it’s available for self-hosting.`}</EngineEmptyText>
      )}
    </EngineEmptyStateRoot>
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
  isSearching: boolean,
  searchText: string,
): EngineOption[] => {
  if (isSearching) {
    return options.filter(e => includesIgnoreCase(e.name, searchText));
  } else {
    return options;
  }
};

const includesIgnoreCase = (
  sourceText: string,
  searchText: string,
): boolean => {
  return sourceText.toLowerCase().includes(searchText.toLowerCase());
};

const getActiveIndex = (
  key: string,
  activeIndex: number | undefined,
  optionCount: number,
): number | undefined => {
  switch (key) {
    case "ArrowDown":
      if (activeIndex != null) {
        return Math.max(activeIndex + 1, optionCount - 1);
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
