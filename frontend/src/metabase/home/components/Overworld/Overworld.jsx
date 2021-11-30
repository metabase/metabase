import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import * as Urls from "metabase/lib/urls";
import {
  DatabaseCardRoot,
  DatabaseGrid,
  DatabaseIcon,
  DatabaseTitle,
  GreetingTitle,
  OverworldRoot,
  Section,
  SectionHeader,
  SectionIcon,
  SectionTitle,
} from "./Overworld.styled";
import Tooltip from "metabase/components/Tooltip";
import ModalWithTrigger from "metabase/components/ModalWithTrigger";
import Button from "metabase/components/Button";
import MetabotLogo from "metabase/components/MetabotLogo";

const Overworld = ({ greeting, databases }) => {
  return (
    <OverworldRoot>
      <GreetingSection greeting={greeting} />
      <DatabaseSection databases={databases} />
    </OverworldRoot>
  );
};

Overworld.propTypes = {
  greeting: PropTypes.string.isRequired,
  databases: PropTypes.array.isRequired,
};

const GreetingSection = ({ greeting }) => {
  return (
    <Section>
      <Tooltip
        tooltip={t`Don't tell anyone, but you're my favorite.`}
        placement="bottom"
      >
        <MetabotLogo />
      </Tooltip>
      <GreetingTitle>{greeting}</GreetingTitle>
    </Section>
  );
};

GreetingSection.propTypes = {
  greeting: PropTypes.string.isRequired,
};

const DatabaseSection = ({ databases, onRemoveSection }) => {
  return (
    <Section>
      <SectionHeader>
        <SectionTitle>{t`Our data`}</SectionTitle>
        <DatabaseSectionModal onRemoveSection={onRemoveSection}>
          <Tooltip tooltip={t`Hide this section`}>
            <SectionIcon name="close" onClick={onRemoveSection} />
          </Tooltip>
        </DatabaseSectionModal>
      </SectionHeader>
      <DatabaseGrid>
        {databases.map(database => (
          <DatabaseCard
            key={database.id}
            title={database.name}
            link={Urls.browseDatabase(database)}
            isActive={true}
          />
        ))}
        <DatabaseCard
          title={t`Add a database`}
          link={Urls.newDatabase()}
          isActive={false}
        />
      </DatabaseGrid>
    </Section>
  );
};

DatabaseSection.propTypes = {
  databases: PropTypes.array.isRequired,
  onRemoveSection: PropTypes.func,
};

const DatabaseCard = ({ title, link, isActive }) => {
  return (
    <DatabaseCardRoot to={link} isActive={isActive}>
      <DatabaseIcon name="database" isActive={isActive} />
      <DatabaseTitle isActive={isActive}>{title}</DatabaseTitle>
    </DatabaseCardRoot>
  );
};

DatabaseCard.propTypes = {
  title: PropTypes.string.isRequired,
  link: PropTypes.string.isRequired,
  isActive: PropTypes.bool,
};

const DatabaseSectionModal = ({ children, onRemoveSection }) => {
  return (
    <ModalWithTrigger
      title={t`Remove this section?`}
      footer={<Button danger onClick={onRemoveSection}>{t`Remove`}</Button>}
      triggerElement={children}
    >
      <span>
        {t`"Our Data" won’t show up on the homepage for any of your users anymore, but you can always browse through your databases and tables by clicking Browse Data in the main navigation.`}
      </span>
    </ModalWithTrigger>
  );
};

DatabaseSectionModal.propTypes = {
  children: PropTypes.node,
  onRemoveSection: PropTypes.func,
};

export default Overworld;
