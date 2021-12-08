import React, { useMemo } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import Field from "metabase-lib/lib/metadata/Field";
import {
  field_visibility_types,
  field_semantic_types,
  has_field_values_options,
} from "metabase/lib/core";

import RootForm from "metabase/containers/Form";

import SidebarContent from "metabase/query_builder/components/SidebarContent";

import FormFieldDivider from "./FormFieldDivider";
import { PaddedContent } from "./DatasetFieldMetadataSidebar.styled";

const propTypes = {
  dataset: PropTypes.object.isRequired,
  field: PropTypes.instanceOf(Field).isRequired,
};

function getVisibilityTypeName(visibilityType) {
  if (visibilityType.id === "normal") {
    return t`Table and details views`;
  }
  if (visibilityType.id === "details-only") {
    return t`Detail views only`;
  }
  return visibilityType.name;
}

function getFieldSemanticTypes() {
  return [
    ...field_semantic_types,
    {
      id: null,
      name: t`No special type`,
      section: t`Other`,
    },
  ];
}

function getFormFields({ dataset }) {
  const visibilityTypeOptions = field_visibility_types
    .filter(type => type.id !== "sensitive")
    .map(type => ({
      name: getVisibilityTypeName(type),
      value: type.id,
    }));

  return [
    { name: "display_name", title: t`Display name` },
    {
      name: "description",
      title: t`Description`,
      placeholder: t`It’s optional, but oh, so helpful`,
      type: "text",
    },
    {
      name: "semantic_type",
      type: "select",
      options: getFieldSemanticTypes().map(type => ({
        name: type.name,
        value: type.id,
      })),
    },
    {
      name: "visibility_type",
      title: t`This column should appear in…`,
      type: "radio",
      options: visibilityTypeOptions,
    },
    {
      name: "display_as",
      title: t`Display as`,
      type: "radio",
      options: [
        { name: t`Text`, value: "text" },
        { name: t`Link`, value: "link" },
      ],
    },
    {
      name: "has_field_values",
      title: t`Filtering on this field`,
      info: t`When this field is used in a filter, what should people use to enter the value they want to filter on?`,
      type: "select",
      options: has_field_values_options,
    },
  ];
}

function DatasetFieldMetadataSidebar({ dataset, field }) {
  const initialValues = useMemo(
    () => ({
      display_name: field?.display_name,
      description: field?.description,
      semantic_type: field?.semantic_type,
      visibility_type: "normal",
      display_as: "text",
      has_field_values: "search",
    }),
    [field],
  );

  return (
    <SidebarContent>
      <PaddedContent>
        {field && (
          <RootForm
            fields={getFormFields({ dataset })}
            initialValues={initialValues}
            overwriteOnInitialValuesChange
          >
            {({ Form, FormField }) => (
              <Form>
                <FormField name="display_name" />
                <FormField name="description" />
                <FormField name="semantic_type" />
                <FormFieldDivider />
                <FormField name="visibility_type" />
                <FormField name="display_as" />
                <FormField name="has_field_values" />
              </Form>
            )}
          </RootForm>
        )}
      </PaddedContent>
    </SidebarContent>
  );
}

DatasetFieldMetadataSidebar.propTypes = propTypes;

export default DatasetFieldMetadataSidebar;
