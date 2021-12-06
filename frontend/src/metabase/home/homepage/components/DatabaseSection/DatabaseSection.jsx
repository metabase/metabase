import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import * as Urls from "metabase/lib/urls";
import Button from "metabase/components/Button";
import Tooltip from "metabase/components/Tooltip";
import ModalWithTrigger from "metabase/components/ModalWithTrigger";
import Section, {
  SectionCloseIcon,
  SectionHeader,
  SectionTitle,
} from "../Section";
import {
  ActionCardRoot,
  ActionLink,
  CardIcon,
  CardTitle,
  DatabaseCardRoot,
  ListRoot,
} from "./DatabaseSection.styled";

const propTypes = {
  user: PropTypes.object.isRequired,
  databases: PropTypes.array.isRequired,
  showData: PropTypes.bool,
  onHideData: PropTypes.func,
};

const DatabaseSection = ({ user, databases, showData, onHideData }) => {
  const hasAddLink = user.is_superuser;
  const hasUserDatabase = databases.some(d => !d.is_sample);

  if (!showData || (!databases.length && !hasAddLink)) {
    return null;
  }

  return (
    <Section>
      <SectionHeader>
        <SectionTitle>{t`Our data`}</SectionTitle>
        {hasAddLink && (
          <SectionRemoveModal onSubmit={onHideData}>
            <Tooltip tooltip={t`Hide this section`}>
              <SectionCloseIcon name="close" />
            </Tooltip>
          </SectionRemoveModal>
        )}
        {hasAddLink && hasUserDatabase && (
          <ActionLink to={Urls.newDatabase()}>{t`Add a database`}</ActionLink>
        )}
      </SectionHeader>
      <ListRoot>
        {databases.map(database => (
          <DatabaseCardRoot
            key={database.id}
            to={Urls.browseDatabase(database)}
          >
            <CardIcon name="database" />
            <CardTitle>{database.name}</CardTitle>
          </DatabaseCardRoot>
        ))}
        {hasAddLink && !hasUserDatabase && (
          <ActionCardRoot to={Urls.newDatabase()}>
            <CardIcon name="database" />
            <CardTitle>{t`Add a database`}</CardTitle>
          </ActionCardRoot>
        )}
      </ListRoot>
    </Section>
  );
};

DatabaseSection.propTypes = propTypes;

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

export default DatabaseSection;
