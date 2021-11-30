import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import Button from "metabase/components/Button";
import ModalWithTrigger from "metabase/components/ModalWithTrigger";
import Section, {
  SectionHeader,
  SectionIcon,
  SectionTitle,
} from "../LandingSection";
import Tooltip from "metabase/components/Tooltip";

const propTypes = {
  isAdmin: PropTypes.bool,
  onRemoveSection: PropTypes.func,
};

const XraySection = ({ isAdmin, onRemoveSection }) => {
  return (
    <Section>
      <SectionHeader>
        <SectionTitle>{t`Try these x-rays based on your data`}</SectionTitle>
        {isAdmin && (
          <SectionRemoveModal onSubmit={onRemoveSection}>
            <Tooltip tooltip={t`Remove these suggestions`}>
              <SectionIcon name="close" />
            </Tooltip>
          </SectionRemoveModal>
        )}
      </SectionHeader>
    </Section>
  );
};

XraySection.propTypes = propTypes;

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
