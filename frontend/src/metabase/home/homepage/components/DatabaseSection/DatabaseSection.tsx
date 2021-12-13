import React, { ReactNode } from "react";
import { t } from "ttag";
import Button from "metabase/components/Button";
import Ellipsified from "metabase/components/Ellipsified";
import ModalWithTrigger from "metabase/components/ModalWithTrigger";
import Tooltip from "metabase/components/Tooltip";
import * as Urls from "metabase/lib/urls";
import { Database, User } from "../../types";
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

interface Props {
  user: User;
  databases: Database[];
  showData?: boolean;
  onHideData?: () => void;
}

const DatabaseSection = ({ user, databases, showData, onHideData }: Props) => {
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
          <HideSectionModal onSubmit={onHideData}>
            <Tooltip tooltip={t`Hide this section`}>
              <SectionCloseIcon name="close" />
            </Tooltip>
          </HideSectionModal>
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
            <CardTitle>
              <Ellipsified>{database.name}</Ellipsified>
            </CardTitle>
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

interface HideSectionModalProps {
  children?: ReactNode;
  onSubmit?: () => void;
}

const HideSectionModal = ({ children, onSubmit }: HideSectionModalProps) => {
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

export default DatabaseSection;
