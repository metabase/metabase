import React, { ChangeEvent, ReactNode, useState } from "react";
import { t } from "ttag";
import Button from "metabase/components/Button";
import Ellipsified from "metabase/components/Ellipsified";
import ModalWithTrigger from "metabase/components/ModalWithTrigger";
import Select, { Option } from "metabase/components/Select";
import Tooltip from "metabase/components/Tooltip";
import { DatabaseCandidate, TableCandidate, User } from "../../types";
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
  SelectRoot,
  SelectTitle,
} from "./XraySection.styled";

export interface XraySectionProps {
  user: User;
  databaseCandidates?: DatabaseCandidate[];
  onHideXrays?: () => void;
}

const XraySection = ({
  user,
  databaseCandidates = [],
  onHideXrays,
}: XraySectionProps): JSX.Element | null => {
  if (!databaseCandidates.length) {
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
      <XrayContent databases={databaseCandidates} />
    </Section>
  );
};

interface XrayContentProps {
  databases: DatabaseCandidate[];
}

const XrayContent = ({ databases }: XrayContentProps): JSX.Element => {
  const schemas = databases.map(d => d.schema);
  const [schema, setSchema] = useState(schemas[0]);
  const database = databases.find(d => d.schema === schema);

  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setSchema(event.target.value);
  };

  return (
    <div>
      {schemas.length > 1 && (
        <SelectRoot>
          <SelectTitle>{t`Based on the schema`}</SelectTitle>
          <Select value={schema} onChange={handleChange}>
            {schemas.map(schema => (
              <Option key={schema} value={schema}>
                {schema}
              </Option>
            ))}
          </Select>
        </SelectRoot>
      )}
      {database && (
        <ListRoot>
          {database.tables.map(table => (
            <XrayCard key={table.url} table={table} />
          ))}
        </ListRoot>
      )}
    </div>
  );
};

interface XrayCardProps {
  table: TableCandidate;
}

const XrayCard = ({ table }: XrayCardProps): JSX.Element => {
  return (
    <CardRoot to={table.url}>
      <CardIconContainer>
        <CardIcon name="bolt" />
      </CardIconContainer>
      <CardTitle>
        <Ellipsified>
          {t`A look at your`} <strong>{table.title}</strong>
        </Ellipsified>
      </CardTitle>
    </CardRoot>
  );
};

interface HideSectionModalProps {
  children?: ReactNode;
  onSubmit?: () => void;
}

const HideSectionModal = ({
  children,
  onSubmit,
}: HideSectionModalProps): JSX.Element => {
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
