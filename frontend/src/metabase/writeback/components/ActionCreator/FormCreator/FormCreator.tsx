import React from "react";
import { t } from "ttag";

import Icon from "metabase/components/Icon";

import type { TemplateTag } from "metabase-types/types/Query";

import {
  FormItemWrapper,
  FormCreatorWrapper,
  FormItemName,
  Input,
  FormSettings,
  EmptyFormPlaceholderWrapper,
} from "./FormCreator.styled";

export function FormCreator({ tags }: { tags: TemplateTag[] }) {
  return (
    <FormCreatorWrapper>
      {tags.map(tag => (
        <FormItem key={tag.id} tag={tag} />
      ))}
      {!tags.length && <EmptyFormPlaceholder />}
    </FormCreatorWrapper>
  );
}

function FormItem({ tag }: { tag: TemplateTag }) {
  const name = tag.name;
  return (
    <FormItemWrapper>
      <FormItemName>{name}</FormItemName>
      <FormSettings>
        <div></div>
        <Icon name="gear" size={16} />
      </FormSettings>
    </FormItemWrapper>
  );
}

function EmptyFormPlaceholder() {
  return (
    <EmptyFormPlaceholderWrapper>
      <img src="/app/assets/img/metabot.svg" />
      <p>{t`To start creating a form, write your query on the left with {{ parameter_names }}.`}</p>
      <p>{t`They'll show up as form fields here`}</p>
    </EmptyFormPlaceholderWrapper>
  );
}
