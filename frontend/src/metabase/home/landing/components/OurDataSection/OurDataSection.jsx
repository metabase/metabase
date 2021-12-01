import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import * as Urls from "metabase/lib/urls";
import Button from "metabase/components/Button";
import Tooltip from "metabase/components/Tooltip";
import ModalWithTrigger from "metabase/components/ModalWithTrigger";
import Section, {
  SectionHeader,
  SectionIcon,
  SectionTitle,
} from "../LandingSection";
import {
  CardRoot,
  ListRoot,
  CardIcon,
  CardTitle,
  ActionLink,
} from "./OutDataSection.styled";

const propTypes = {
  user: PropTypes.object.isRequired,
  databases: PropTypes.array.isRequired,
  onRemoveSection: PropTypes.func,
};

const OurDataSection = ({ user, databases, onRemoveSection }) => {
  const hasNonSampleDatabase = databases.some(d => !d.is_sample);

  return (
    <Section>
      <SectionHeader>
        <SectionTitle>{t`Our data`}</SectionTitle>
        {user.is_superuser && (
          <SectionRemoveModal onSubmit={onRemoveSection}>
            <Tooltip tooltip={t`Hide this section`}>
              <SectionIcon name="close" />
            </Tooltip>
          </SectionRemoveModal>
        )}
        {user.is_superuser && hasNonSampleDatabase && (
          <ActionLink to={Urls.newDatabase()}>{t`Add a database`}</ActionLink>
        )}
      </SectionHeader>
      <ListRoot>
        {databases.map(database => (
          <DatabaseCard
            key={database.id}
            title={database.name}
            link={Urls.browseDatabase(database)}
            isActive={true}
          />
        ))}
        {user.is_superuser && !hasNonSampleDatabase && (
          <DatabaseCard
            title={t`Add a database`}
            link={Urls.newDatabase()}
            isActive={false}
          />
        )}
      </ListRoot>
    </Section>
  );
};

OurDataSection.propTypes = propTypes;

const cardPropTypes = {
  title: PropTypes.string.isRequired,
  link: PropTypes.string.isRequired,
  isActive: PropTypes.bool,
};

const DatabaseCard = ({ title, link, isActive }) => {
  return (
    <CardRoot to={link} isActive={isActive}>
      <CardIcon name="database" isActive={isActive} />
      <CardTitle>{title}</CardTitle>
    </CardRoot>
  );
};

DatabaseCard.propTypes = cardPropTypes;

const modalPropTypes = {
  children: PropTypes.node,
  onSubmit: PropTypes.func,
};

const SectionRemoveModal = ({ children, onSubmit }) => {
  return (
    <ModalWithTrigger
      title={t`Remove this section?`}
      footer={<Button danger onClick={onSubmit}>{t`Remove`}</Button>}
      triggerElement={children}
    >
      <span>
        {t`"Our Data" won’t show up on the homepage for any of your users anymore, but you can always browse through your databases and tables by clicking Browse Data in the main navigation.`}
      </span>
    </ModalWithTrigger>
  );
};

SectionRemoveModal.propTypes = modalPropTypes;

export default OurDataSection;
