import { useState } from "react";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import * as Urls from "metabase/lib/urls";
import { Center, Flex } from "metabase/ui";
import type { Card, Field } from "metabase-types/api";

import { ModelHeader } from "../../components/ModelHeader";
import { useLoadCardWithMetadata } from "../../hooks/use-load-card-with-metadata";

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

  const activeFieldIndex = fields.findIndex(
    (field) => field.name === activeFieldName,
  );

  const handleSelect = (field: Field) => {
    setActiveFieldName(field.name);
  };

  const handleNameChange = () => null;

  const handleDescriptionChange = () => null;

  return (
    <Flex direction="column" h="100%" bg="bg-light">
      <ModelHeader card={card} />
      <ModelFieldList
        fields={fields}
        activeFieldIndex={activeFieldIndex}
        onSelect={handleSelect}
        onNameChange={handleNameChange}
        onDescriptionChange={handleDescriptionChange}
      />
    </Flex>
  );
}
