import React, { useState } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import Button from "metabase/components/Button";
import TextInput from "metabase/components/TextInput";
import {
  EngineCard,
  EngineCardLogo,
  EngineCardTitle,
  EngineList,
} from "./EngineWidget.styled";

const galleryPropTypes = {
  elevatedEngines: PropTypes.array.isRequired,
  nonElevatedEngines: PropTypes.array.isRequired,
  onEngineChange: PropTypes.func,
};

const EngineGallery = ({
  elevatedEngines,
  nonElevatedEngines,
  onEngineChange,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [searchText, setSearchText] = useState("");
  const isSearching = searchText.length > 0;

  const visibleEngines = getVisibleEngines({
    elevatedEngines,
    nonElevatedEngines,
    isExpanded,
    isSearching,
    searchText,
  });

  return (
    <div>
      <EngineList>
        <TextInput
          value={searchText}
          placeholder={t`Search for a database...`}
          onChange={setSearchText}
        />
        {visibleEngines.map(engine => (
          <EngineCard
            key={engine.value}
            onClick={() => onEngineChange(engine.value)}
          >
            <EngineCardLogo src={engine.logo} />
            <EngineCardTitle>{engine.name}</EngineCardTitle>
          </EngineCard>
        ))}
      </EngineList>
      {!isSearching && (
        <Button onClick={() => setIsExpanded(!isExpanded)}>
          {isExpanded ? t`Show more options` : t`Show less options`}
        </Button>
      )}
    </div>
  );
};

EngineGallery.propTypes = galleryPropTypes;

const getVisibleEngines = ({
  elevatedEngines,
  nonElevatedEngines,
  isExpanded,
  isSearching,
  searchText,
}) => {
  const allEngines = elevatedEngines.concat(nonElevatedEngines);

  if (isSearching) {
    return allEngines.filter(e => includesIgnoreCase(e.name, searchText));
  } else if (isExpanded) {
    return allEngines;
  } else {
    return elevatedEngines;
  }
};

const includesIgnoreCase = (sourceText, searchText) => {
  return sourceText.toLowerCase().includes(searchText.toLowerCase());
};
