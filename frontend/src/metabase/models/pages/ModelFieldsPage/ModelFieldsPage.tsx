import { useMemo, useState } from "react";
import type { Route } from "react-router";
import { t } from "ttag";
import _ from "underscore";

import { useUpdateCardMutation } from "metabase/api";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PaneHeaderActions } from "metabase/data-studio/components/PaneHeader";
import * as Urls from "metabase/lib/urls";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Center, Flex } from "metabase/ui";
import type { Card, Field } from "metabase-types/api";

import { ModelHeader } from "../../components/ModelHeader";
import { useLoadCardWithMetadata } from "../../hooks/use-load-card-with-metadata";

import { ModelFieldEmptyState } from "./ModelFieldEmptyState";
import { ModelFieldInfo } from "./ModelFieldInfo";
import { ModelFieldList } from "./ModelFieldList";

type ModelFieldsPageParams = {
  cardId: string;
};

type ModelFieldsPageProps = {
  params: ModelFieldsPageParams;
  route: Route;
};

export function ModelFieldsPage({ params, route }: ModelFieldsPageProps) {
  const cardId = Urls.extractEntityId(params.cardId);
  const { card, isLoading, error } = useLoadCardWithMetadata(cardId);

  if (isLoading || error != null || card == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return <ModelFieldsPageBody card={card} route={route} />;
}

type ModelFieldsPageBodyProps = {
  card: Card;
  route: Route;
};

function ModelFieldsPageBody({ card, route }: ModelFieldsPageBodyProps) {
  const [fields, setFields] = useState(card.result_metadata ?? []);
  const [activeFieldName, setActiveFieldName] = useState<string>();
  const [updateCard, { isLoading: isSaving }] = useUpdateCardMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  const activeField = useMemo(
    () => (activeFieldName ? fieldField(fields, activeFieldName) : null),
    [fields, activeFieldName],
  );

  const isDirty = useMemo(
    () => !_.isEqual(fields, card.result_metadata ?? []),
    [fields, card],
  );

  const handleSelect = (field: Field) => {
    setActiveFieldName(field.name);
  };

  const handleNameChange = (field: Field, name: string) => {
    setFields(updateField(fields, field, { display_name: name }));
  };

  const handleDescriptionChange = (
    field: Field,
    description: string | null,
  ) => {
    setFields(updateField(fields, field, { description }));
  };

  const handleSave = async () => {
    const { error } = await updateCard({
      id: card.id,
      result_metadata: fields,
    });
    if (error == null) {
      sendSuccessToast(t`Model fields updated`);
    } else {
      sendErrorToast(t`Failed to update model fields`);
    }
  };

  const handleCancel = () => {
    setFields(card.result_metadata ?? []);
  };

  return (
    <>
      <Flex direction="column" h="100%" bg="bg-light">
        <ModelHeader
          card={card}
          actions={
            <PaneHeaderActions
              isDirty={isDirty}
              isSaving={isSaving}
              onSave={handleSave}
              onCancel={handleCancel}
            />
          }
        />
        <Flex flex={1} mih={0}>
          <ModelFieldList
            fields={fields}
            activeFieldName={activeFieldName}
            onSelect={handleSelect}
            onNameChange={handleNameChange}
            onDescriptionChange={handleDescriptionChange}
          />
          {activeField != null ? (
            <ModelFieldInfo
              field={activeField}
              onNameChange={handleNameChange}
              onDescriptionChange={handleDescriptionChange}
            />
          ) : (
            <ModelFieldEmptyState />
          )}
        </Flex>
      </Flex>
      <LeaveRouteConfirmModal route={route} isEnabled={isDirty} />
    </>
  );
}

function fieldField(fields: Field[], fieldName: string) {
  return fields[findFieldIndex(fields, fieldName)];
}

function findFieldIndex(fields: Field[], fieldName: string) {
  return fields.findIndex((field) => field.name === fieldName);
}

function updateField(fields: Field[], field: Field, updates: Partial<Field>) {
  const newFields = [...fields];
  newFields[findFieldIndex(fields, field.name)] = { ...field, ...updates };
  return newFields;
}
