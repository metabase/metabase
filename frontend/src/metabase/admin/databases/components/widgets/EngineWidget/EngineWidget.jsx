import React, { useCallback } from "react";
import PropTypes from "prop-types";
import {
  EngineBannerIcon,
  EngineBannerRoot,
  EngineBannerTitle,
  EngineCardLogo,
  EngineCardRoot,
  EngineCardTitle,
  EngineListRoot,
} from "./EngineWidget.styled";

const EngineWidget = () => {
  return (
    <EngineBanner
      engine={{ name: "MySQL", logo: "/app/assets/img/databases/mysql.svg" }}
    />
  );
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
      <EngineCardLogo src={engine.logo} />
      <EngineCardTitle>{engine.name}</EngineCardTitle>
    </EngineCardRoot>
  );
};

EngineCard.propTypes = cardPropTypes;

const bannerPropTypes = {
  engine: PropTypes.object.isRequired,
  onChange: PropTypes.func,
};

const EngineBanner = ({ engine, onChange }) => {
  const handleRemoveClick = useCallback(() => {
    onChange && onChange(null);
  }, [onChange]);

  return (
    <EngineBannerRoot>
      <EngineBannerTitle>{engine.name}</EngineBannerTitle>
      <EngineBannerIcon name="close" onClick={handleRemoveClick} />
    </EngineBannerRoot>
  );
};

EngineBanner.propTypes = bannerPropTypes;

export default EngineWidget;
