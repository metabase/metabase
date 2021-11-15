import React, { useCallback, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { jt, t } from "ttag";
import { getEngineLogo } from "metabase/lib/engine";
import TextInput from "metabase/components/TextInput";
import ExternalLink from "metabase/components/ExternalLink";
import {
  EngineCardIcon,
  EngineCardImage,
  EngineCardRoot,
  EngineCardTitle,
  EngineEmptyIcon,
  EngineEmptyStateRoot,
  EngineEmptyText,
  EngineExpandButton,
  EngineInfoIcon,
  EngineInfoRoot,
  EngineInfoTitle,
  EngineListRoot,
  EngineSearchRoot,
} from "./EngineWidget.styled";

const EngineWidget = ({ field, options }) => {
  if (field.value) {
    return <EngineInfo field={field} options={options} />;
  } else {
    return <EngineSearch field={field} options={options} />;
  }
};

EngineWidget.propTypes = {
  field: PropTypes.object.isRequired,
  options: PropTypes.array.isRequired,
};

const EngineInfo = ({ field, options }) => {
  const option = options.find(option => option.value === field.value);

  const handleClick = useCallback(() => {
    field.onChange(undefined);
  }, [field]);

  return (
    <EngineInfoRoot>
      <EngineInfoTitle>{option ? option.name : field.value}</EngineInfoTitle>
      <EngineInfoIcon
        name="close"
        size={18}
        aria-label={t`Remove database`}
        onClick={handleClick}
      />
    </EngineInfoRoot>
  );
};

EngineInfo.propTypes = {
  field: PropTypes.object.isRequired,
  options: PropTypes.array.isRequired,
};

const EngineSearch = ({ field, options }) => {
  const [searchText, setSearchText] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const isSearching = searchText.length > 0;

  const sortedOptions = useMemo(() => {
    return getSortedOptions(options);
  }, [options]);

  const visibleOptions = useMemo(
    () => getVisibleOptions(sortedOptions, isExpanded, isSearching, searchText),
    [sortedOptions, isExpanded, isSearching, searchText],
  );

  return (
    <EngineSearchRoot>
      <TextInput
        value={searchText}
        placeholder={t`Search for a database…`}
        onChange={setSearchText}
      />
      {visibleOptions.length ? (
        <EngineList field={field} options={visibleOptions} />
      ) : (
        <EngineEmptyState />
      )}
      {!isSearching && (
        <EngineToggle
          isExpanded={isExpanded}
          onExpandedChange={setIsExpanded}
        />
      )}
    </EngineSearchRoot>
  );
};

EngineSearch.propTypes = {
  field: PropTypes.object.isRequired,
  options: PropTypes.array.isRequired,
};

const EngineList = ({ field, options }) => {
  return (
    <EngineListRoot>
      {options.map(option => (
        <EngineCard key={option.value} field={field} option={option} />
      ))}
    </EngineListRoot>
  );
};

EngineList.propTypes = {
  field: PropTypes.object,
  options: PropTypes.array,
};

const EngineCard = ({ field, option }) => {
  const logo = getEngineLogo(option.value);

  const handleClick = useCallback(() => {
    field.onChange(option.value);
  }, [field, option]);

  return (
    <EngineCardRoot key={option.value} onClick={handleClick}>
      {logo ? (
        <EngineCardImage src={logo} />
      ) : (
        <EngineCardIcon name="database" />
      )}
      <EngineCardTitle>{option.name}</EngineCardTitle>
    </EngineCardRoot>
  );
};

EngineCard.propTypes = {
  field: PropTypes.object,
  option: PropTypes.object,
};

const EngineEmptyState = () => {
  return (
    <EngineEmptyStateRoot>
      <EngineEmptyIcon name="search" size={32} />
      <EngineEmptyText>{jt`Don’t see your database? Check out our ${(
        <ExternalLink href="https://www.metabase.com/docs/latest/developers-guide-drivers.html">
          {t`Community Drivers`}
        </ExternalLink>
      )} page to see if it’s available for self-hosting.`}</EngineEmptyText>
    </EngineEmptyStateRoot>
  );
};

const EngineToggle = ({ isExpanded, onExpandedChange }) => {
  const handleClick = useCallback(() => {
    onExpandedChange(!isExpanded);
  }, [isExpanded, onExpandedChange]);

  return (
    <EngineExpandButton
      primary
      icon={isExpanded ? "chevronup" : "chevrondown"}
      onClick={handleClick}
    >
      {isExpanded ? t`Show less options` : t`Show more options`}
    </EngineExpandButton>
  );
};

EngineToggle.propTypes = {
  isExpanded: PropTypes.bool,
  onExpandedChange: PropTypes.func,
};

const getSortedOptions = options => {
  return options.sort((a, b) => {
    if (a.index >= 0 && b.index >= 0) {
      return a.index - b.index;
    } else if (a.index >= 0) {
      return -1;
    } else {
      return a.name.localeCompare(b.name);
    }
  });
};

const getVisibleOptions = (options, isExpanded, isSearching, searchText) => {
  if (isSearching) {
    return options.filter(e => includesIgnoreCase(e.name, searchText));
  } else if (isExpanded) {
    return options;
  } else {
    return options.filter(e => e.index >= 0);
  }
};

const includesIgnoreCase = (sourceText, searchText) => {
  return sourceText.toLowerCase().includes(searchText.toLowerCase());
};

export default EngineWidget;
