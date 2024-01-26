import PropTypes from "prop-types";
import { t } from "ttag";
import MetabaseSettings from "metabase/lib/settings";
import Modal from "metabase/components/Modal";
import ModalContent from "metabase/components/ModalContent";
import {
  Content,
  Description,
  ButtonLink,
  CenteredRow,
} from "./ModelEducationalModal.styled";

ModelEducationalModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
};

const EDUCATION_URL = MetabaseSettings.learnUrl("getting-started/models");

export function ModelEducationalModal({ isOpen, onClose }) {
  return (
    <Modal isOpen={isOpen} medium onClose={onClose}>
      <ModalContent
        title={t`Create models to make it easier for your team to explore.`}
        centeredTitle
        onClose={onClose}
      >
        <Content>
          <img
            width="520px"
            className="mx1"
            src="app/assets/img/models-education.png"
            srcSet="
            app/assets/img/models-education.png    1x,
            app/assets/img/models-education@2x.png 2x
          "
          />
          <Description>
            {t`Instead of having your end users wade through your complex raw data, you can create custom models that are easy to find, understand, and explore.`}
          </Description>
          <CenteredRow>
            <ButtonLink
              href={EDUCATION_URL}
              className="Button Button--primary"
            >{t`Learn how`}</ButtonLink>
          </CenteredRow>
        </Content>
      </ModalContent>
    </Modal>
  );
}
