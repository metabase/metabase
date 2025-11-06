import { useState } from "react";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import * as Urls from "metabase/lib/urls";
import { Center, Flex } from "metabase/ui";
import type { Card, Field } from "metabase-types/api";

import { ModelHeader } from "../../components/ModelHeader";
import { useLoadCardWithMetadata } from "../../hooks/use-load-card-with-metadata";

import { ModelFieldInfo } from "./ModelFieldInfo";
import { ModelFieldList } from "./ModelFieldList";

type ModelFieldsPageParams = {
  cardId: string;
};

type ModelFieldsPageProps = {
  params: ModelFieldsPageParams;
};

export function ModelFieldsPage({ params }: ModelFieldsPageProps) {
  const cardId = Urls.extractEntityId(params.cardId);
  const { card, isLoading, error } = useLoadCardWithMetadata(cardId);

  if (isLoading || error != null || card == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return <ModelFieldsPageBody card={card} />;
}

type ModelFieldsPageBodyProps = {
  card: Card;
};

function ModelFieldsPageBody({ card }: ModelFieldsPageBodyProps) {
  const fields = card.result_metadata ?? [];
  const [activeFieldName, setActiveFieldName] = useState<string>();
  const activeField = fields.find((field) => field.name === activeFieldName);

  const handleSelect = (field: Field) => {
    setActiveFieldName(field.name);
  };

  const handleNameChange = () => null;

  const handleDescriptionChange = () => null;

  return (
    <Flex direction="column" h="100%" bg="bg-light">
      <ModelHeader card={card} />
      <Flex flex={1} mih={0}>
        <ModelFieldList
          fields={fields}
          activeFieldName={activeFieldName}
          onSelect={handleSelect}
          onNameChange={handleNameChange}
          onDescriptionChange={handleDescriptionChange}
        />
        {activeField != null && (
          <ModelFieldInfo
            field={activeField}
            onNameChange={handleNameChange}
            onDescriptionChange={handleDescriptionChange}
          />
        )}
      </Flex>
    </Flex>
  );
}
