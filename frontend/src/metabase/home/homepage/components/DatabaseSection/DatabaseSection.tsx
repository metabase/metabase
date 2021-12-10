import React, { ReactNode } from "react";
import { t, jt } from "ttag";
import Button from "metabase/components/Button";
import Ellipsified from "metabase/components/Ellipsified";
import Link from "metabase/components/Link";
import ModalContent from "metabase/components/ModalContent";
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

interface ExploreDataModalProps {
  databases: Database[];
  showXrays?: boolean;
  showExploreModal?: boolean;
  onClose?: () => void;
}

const ExploreDataModal = ({
  databases,
  showXrays,
  onClose,
}: ExploreDataModalProps) => {
  const sampleDatabase = databases.find(d => d.is_sample);

  return (
    <ModalContent
      title={t`Great, we're taking a look at your database!`}
      footer={
        sampleDatabase ? (
          <Link to={showXrays ? Urls.exploreDatabase(sampleDatabase) : "/"}>
            <Button primary>{t`Explore sample data`}</Button>
          </Link>
        ) : (
          <Link to="/">
            <Button primary>{t`Explore your Metabase`}</Button>
          </Link>
        )
      }
      onClose={onClose}
    >
      <div>
        <span>
          {t`You’ll be able to use individual tables as they finish syncing. `}
        </span>
        {sampleDatabase ? (
          <span>
            {jt`You can also explore our ${(
              <strong>{sampleDatabase.name}</strong>
            )} in the meantime if you want to get a head start.`}
          </span>
        ) : (
          <span>
            {t`Have a look around your Metabase in the meantime if you want to get a head start.`}
          </span>
        )}
      </div>
    </ModalContent>
  );
};

export default DatabaseSection;
