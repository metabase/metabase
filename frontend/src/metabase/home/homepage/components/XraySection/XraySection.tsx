import React, { ReactNode } from "react";
import { t } from "ttag";
import Button from "metabase/components/Button";
import Ellipsified from "metabase/components/Ellipsified";
import ModalWithTrigger from "metabase/components/ModalWithTrigger";
import Tooltip from "metabase/components/Tooltip";
import {
  Dashboard,
  DatabaseCandidate,
  TableCandidate,
  User,
} from "../../types";
import Section, {
  SectionCloseIcon,
  SectionHeader,
  SectionTitle,
} from "../Section";
import {
  CardIcon,
  CardIconContainer,
  CardRoot,
  CardTitle,
  ListRoot,
} from "./XraySection.styled";

interface Props {
  user: User;
  dashboards: Dashboard[];
  databaseCandidates?: DatabaseCandidate[];
  showXrays?: boolean;
  onHideXrays?: () => void;
}

const XraySection = ({
  user,
  dashboards,
  databaseCandidates = [],
  showXrays,
  onHideXrays,
}: Props) => {
  const options = databaseCandidates.flatMap(database => database.tables);

  if (!showXrays || dashboards.length || !options.length) {
    return null;
  }

  return (
    <Section>
      <SectionHeader>
        <SectionTitle>{t`Try these x-rays based on your data`}</SectionTitle>
        {user.is_superuser && (
          <HideSectionModal onSubmit={onHideXrays}>
            <Tooltip tooltip={t`Remove these suggestions`}>
              <SectionCloseIcon name="close" />
            </Tooltip>
          </HideSectionModal>
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

interface XrayCardProps {
  option: TableCandidate;
}

const XrayCard = ({ option }: XrayCardProps) => {
  return (
    <CardRoot to={option.url}>
      <CardIconContainer>
        <CardIcon name="bolt" />
      </CardIconContainer>
      <CardTitle>
        <Ellipsified>
          {t`A look at your`} <strong>{option.title}</strong>
        </Ellipsified>
      </CardTitle>
    </CardRoot>
  );
};

interface HideSectionModalProps {
  children?: ReactNode;
  onSubmit?: () => void;
}

const HideSectionModal = ({ children, onSubmit }: HideSectionModalProps) => {
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

export default XraySection;
