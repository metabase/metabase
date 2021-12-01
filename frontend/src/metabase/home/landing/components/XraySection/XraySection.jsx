import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
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
  CardIconContainer,
  CardTitle,
} from "./XraySection.styled";

const propTypes = {
  user: PropTypes.object.isRequired,
  candidates: PropTypes.array.isRequired,
  onRemoveSection: PropTypes.func,
};

const XraySection = ({ user, candidates, onRemoveSection }) => {
  const options = candidates.flatMap(database => database.tables);

  return (
    <Section>
      <SectionHeader>
        <SectionTitle>{t`Try these x-rays based on your data`}</SectionTitle>
        {user.is_superuser && (
          <SectionRemoveModal onSubmit={onRemoveSection}>
            <Tooltip tooltip={t`Remove these suggestions`}>
              <SectionIcon name="close" />
            </Tooltip>
          </SectionRemoveModal>
        )}
      </SectionHeader>
      <ListRoot>
        {options.map(option => (
          <XrayCard key={option.url} option={option} />
        ))}
      </ListRoot>
    </Section>
  );
};

XraySection.propTypes = propTypes;

const cardPropTypes = {
  option: PropTypes.object.isRequired,
};

const XrayCard = ({ option }) => {
  return (
    <CardRoot to={option.url}>
      <CardIconContainer>
        <CardIcon name="bolt" />
      </CardIconContainer>
      <CardTitle>
        {t`A look at your`} <strong>{option.title}</strong>
      </CardTitle>
    </CardRoot>
  );
};

XrayCard.propTypes = cardPropTypes;

const modalPropTypes = {
  children: PropTypes.node,
  onSubmit: PropTypes.func,
};

const SectionRemoveModal = ({ children, onSubmit }) => {
  return (
    <ModalWithTrigger
      title={t`Remove these suggestions?`}
      footer={<Button danger onClick={onSubmit}>{t`Remove`}</Button>}
      triggerElement={children}
    >
      <span>
        {t`These won’t show up on the homepage for any of your users anymore, but you can always get to x-rays by clicking on Browse Data in the main navigation, then clicking on the lightning bolt icon on one of your tables.`}
      </span>
    </ModalWithTrigger>
  );
};

SectionRemoveModal.propTypes = modalPropTypes;

export default XraySection;
