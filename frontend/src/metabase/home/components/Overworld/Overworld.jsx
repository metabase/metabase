import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import * as Urls from "metabase/lib/urls";
import {
  DatabaseCard,
  DatabaseGrid,
  DatabaseIcon,
  DatabaseTitle,
  OverworldRoot,
  SectionHeader,
  SectionIcon,
  SectionTitle,
} from "./Overworld.styled";

const Overworld = ({ databases }) => {
  return (
    <OverworldRoot>
      <DatabaseSection databases={databases} />
    </OverworldRoot>
  );
};

Overworld.propTypes = {
  databases: PropTypes.array,
};

const DatabaseSection = ({ databases, onRemoveSection }) => {
  return (
    <div>
      <SectionHeader>
        <SectionTitle>{t`Our data`}</SectionTitle>
        <SectionIcon name="close" onClick={onRemoveSection} />
      </SectionHeader>
      <DatabaseGrid>
        {databases.map(database => (
          <DatabaseItem
            key={database.id}
            title={database.name}
            link={Urls.browseDatabase(database)}
            isActive={true}
          />
        ))}
        <DatabaseItem
          title={t`Add a database`}
          link={Urls.newDatabase()}
          isActive={false}
        />
      </DatabaseGrid>
    </div>
  );
};

DatabaseSection.propTypes = {
  databases: PropTypes.array.isRequired,
  onRemoveSection: PropTypes.func,
};

const DatabaseItem = ({ title, link, isActive }) => {
  return (
    <DatabaseCard to={link} isActive={isActive}>
      <DatabaseIcon name="database" isActive={isActive} />
      <DatabaseTitle isActive={isActive}>{title}</DatabaseTitle>
    </DatabaseCard>
  );
};

DatabaseItem.propTypes = {
  title: PropTypes.string.isRequired,
  link: PropTypes.string.isRequired,
  isActive: PropTypes.bool,
};

export default Overworld;
