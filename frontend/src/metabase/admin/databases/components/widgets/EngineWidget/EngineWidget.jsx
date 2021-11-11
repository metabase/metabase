import React, { useMemo, useState } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import TextInput from "metabase/components/TextInput";
import {
  EngineCard,
  EngineCardIcon,
  EngineCardTitle,
  EngineEmptyIcon,
  EngineEmptyState,
  EngineEmptyText,
  EngineExpandButton,
  EngineGalleryRoot,
  EngineInfoIcon,
  EngineInfoRoot,
  EngineInfoTitle,
  EngineList,
} from "./EngineWidget.styled";

const propTypes = {
  field: PropTypes.object.isRequired,
  options: PropTypes.array.isRequired,
};

const EngineWidget = ({ field, options }) => {
  if (field.value) {
    return <EngineInfo field={field} options={options} />;
  } else {
    return <EngineGallery field={field} options={options} />;
  }
};

EngineWidget.propTypes = propTypes;

const infoPropTypes = {
  field: PropTypes.object.isRequired,
  options: PropTypes.array.isRequired,
};

const EngineInfo = ({ field, options }) => {
  const option = options.find(option => option.value === field.value);

  return (
    <EngineInfoRoot>
      {option && <EngineInfoTitle>{option.name}</EngineInfoTitle>}
      <EngineInfoIcon name="close" size={12} onClick={() => field.onChange()} />
    </EngineInfoRoot>
  );
};

EngineInfo.propTypes = infoPropTypes;

const galleryPropTypes = {
  field: PropTypes.object.isRequired,
  options: PropTypes.array.isRequired,
};

const EngineGallery = ({ field, options }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [searchText, setSearchText] = useState("");

  const isSearching = searchText.length > 0;
  const sortedOptions = useMemo(() => getSortedOptions(options), [options]);

  const visibleOptions = getVisibleOptions(
    sortedOptions,
    isExpanded,
    isSearching,
    searchText,
  );

  return (
    <EngineGalleryRoot>
      <TextInput
        value={searchText}
        placeholder={t`Search for a database...`}
        onChange={setSearchText}
      />
      {visibleOptions.length ? (
        <EngineList>
          {visibleOptions.map(engine => (
            <EngineCard
              key={engine.value}
              onClick={() => field.onChange(engine.value)}
            >
              <EngineCardIcon name="database" img={engine.icon} />
              <EngineCardTitle>{engine.name}</EngineCardTitle>
            </EngineCard>
          ))}
        </EngineList>
      ) : (
        <EngineEmptyState>
          <EngineEmptyIcon name="search" size={32} />
          <EngineEmptyText>{t`Didn't find anything`}</EngineEmptyText>
        </EngineEmptyState>
      )}
      {!isSearching && (
        <EngineExpandButton
          primary
          icon={isExpanded ? "chevronup" : "chevrondown"}
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? t`Show less options` : t`Show more options`}
        </EngineExpandButton>
      )}
    </EngineGalleryRoot>
  );
};

EngineGallery.propTypes = galleryPropTypes;

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
