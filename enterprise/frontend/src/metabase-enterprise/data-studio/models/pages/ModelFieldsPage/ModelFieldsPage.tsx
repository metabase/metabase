import { useLayoutEffect, useMemo, useState } from "react";
import type { Route } from "react-router";
import { useLatest } from "react-use";
import { t } from "ttag";
import _ from "underscore";

import {
  skipToken,
  useListDatabaseIdFieldsQuery,
  useUpdateCardMutation,
} from "metabase/api";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import * as Urls from "metabase/lib/urls";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import { Center, Flex } from "metabase/ui";
import { useLoadCardWithMetadata } from "metabase-enterprise/data-studio/common/hooks/use-load-card-with-metadata";
import type { Card, Field } from "metabase-types/api";

import { PaneHeaderActions } from "../../../common/components/PaneHeader";
import { ModelHeader } from "../../components/ModelHeader";
import type { FieldOverrides } from "../../types";

import { ModelFieldDetails } from "./ModelFieldDetails";
import { ModelFieldList } from "./ModelFieldList";
import S from "./ModelFieldsPage.module.css";

type ModelFieldsPageParams = {
  cardId: string;
};

type ModelFieldsPageProps = {
  params: ModelFieldsPageParams;
  route: Route;
};

export function ModelFieldsPage({ params, route }: ModelFieldsPageProps) {
  const cardId = Urls.extractEntityId(params.cardId);
  const {
    card,
    isLoading: isLoadingCard,
    error: cardError,
  } = useLoadCardWithMetadata(cardId);
  const {
    data: idFields = [],
    isLoading: isLoadingFields,
    error: fieldsError,
  } = useListDatabaseIdFieldsQuery(
    card?.database_id != null
      ? {
          id: card.database_id,
          ...PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataModelQueryProps,
        }
      : skipToken,
  );
  const isLoading = isLoadingCard || isLoadingFields;
  const error = cardError ?? fieldsError;

  if (isLoading || error != null || card == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return <ModelFieldsPageBody card={card} idFields={idFields} route={route} />;
}

type ModelFieldsPageBodyProps = {
  card: Card;
  idFields: Field[];
  route: Route;
};

function ModelFieldsPageBody({
  card,
  idFields,
  route,
}: ModelFieldsPageBodyProps) {
  const [fields, setFields] = useState(card.result_metadata ?? []);
  const [activeFieldName, setActiveFieldName] = useState<string>();
  const [isSorting, setIsSorting] = useState(false);
  const [updateCard, { isLoading: isSaving }] = useUpdateCardMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();
  const isReadOnly = !card.can_write;

  const activeField = useMemo(
    () => (activeFieldName ? fieldField(fields, activeFieldName) : null),
    [fields, activeFieldName],
  );

  const isDirty = useMemo(
    () => !_.isEqual(fields, card.result_metadata ?? []),
    [fields, card],
  );

  const handleSelectField = (field: Field) => {
    setActiveFieldName(field.name);
  };

  const handleChangeField = (field: Field, overrides: FieldOverrides) => {
    const newFields = [...fields];
    newFields[findFieldIndex(fields, field.name)] = { ...field, ...overrides };
    setFields(newFields);
  };

  const handleSave = async () => {
    setIsSorting(false);
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
    setActiveFieldName(undefined);
    setIsSorting(false);
  };

  const resetRef = useLatest(handleCancel);

  useLayoutEffect(() => {
    resetRef.current();
  }, [card.id, resetRef]);

  return (
    <>
      <Flex direction="column" h="100%" data-testid="model-fields-page">
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
        <Flex className={S.contentWrapper} flex={1}>
          <Flex flex={1} mih={0} bg="bg-light" miw={740}>
            <ModelFieldList
              fields={fields}
              activeFieldName={activeFieldName}
              isSorting={isSorting}
              isReadOnly={isReadOnly}
              onSelectField={handleSelectField}
              onChangeField={handleChangeField}
              onChangeSorting={setFields}
              onToggleSorting={setIsSorting}
            />
            {activeField != null ? (
              <ModelFieldDetails
                field={activeField}
                idFields={idFields}
                isReadOnly={isReadOnly}
                onChangeField={handleChangeField}
              />
            ) : null}
          </Flex>
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
