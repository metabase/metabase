import React, { useCallback } from "react";
import PropTypes from "prop-types";
import {
  EngineCardIcon,
  EngineCardRoot,
  EngineCardTitle,
  EngineListRoot,
} from "./EngineWidget.styled";

const EngineWidget = () => {
  return null;
};

const listPropTypes = {
  engines: PropTypes.array.isRequired,
  onChange: PropTypes.func,
};

const EngineList = ({ engines, onChange }) => {
  return (
    <EngineListRoot>
      {engines.map(engine => (
        <EngineCard key={engine.name} engine={engine} onChange={onChange} />
      ))}
    </EngineListRoot>
  );
};

EngineList.propTypes = listPropTypes;

const cardPropTypes = {
  engine: PropTypes.object.isRequired,
  onChange: PropTypes.func,
};

const EngineCard = ({ engine, onChange }) => {
  const handleClick = useCallback(() => {
    onChange && onChange(engine);
  }, [engine, onChange]);

  return (
    <EngineCardRoot onClick={handleClick}>
      <EngineCardIcon src={engine.icon} />
      <EngineCardTitle>{engine.name}</EngineCardTitle>
    </EngineCardRoot>
  );
};

EngineCard.propTypes = cardPropTypes;
