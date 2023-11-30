import { t } from "ttag";
import MetabaseSettings from "metabase/lib/settings";
import { PLUGIN_CACHING } from "metabase/plugins";

import { DashboardCopyModalShallowCheckboxLabel } from "metabase/dashboard/components/DashboardCopyModal/DashboardCopyModalShallowCheckboxLabel/DashboardCopyModalShallowCheckboxLabel";

function createNameField() {
  return {
    name: "name",
    title: t`Name`,
    placeholder: t`What is the name of your dashboard?`,
    autoFocus: true,
    validate: name => (!name ? t`Name is required` : null),
  };
}

function createDescriptionField() {
  return {
    name: "description",
    title: t`Description`,
    type: "text",
    placeholder: t`It's optional but oh, so helpful`,
  };
}

function createCollectionIdField() {
  return {
    name: "collection_id",
    title: t`Which collection should this go in?`,
    type: "collection",
    validate: collectionId =>
      collectionId === undefined ? t`Collection is required` : null,
  };
}

function createShallowCopyField() {
  return {
    name: "is_shallow_copy",
    type: "checkbox",
    label: <DashboardCopyModalShallowCheckboxLabel />,
  };
}

function duplicateForm() {
  return [
    createNameField(),
    createDescriptionField(),
    createCollectionIdField(),
    createShallowCopyField(),
  ];
}

function createForm() {
  return [
    createNameField(),
    createDescriptionField(),
    createCollectionIdField(),
  ];
}

export default {
  create: {
    fields: createForm,
  },
  duplicate: {
    fields: duplicateForm,
  },
  edit: {
    fields: () => {
      const fields = [...createForm()];
      if (
        MetabaseSettings.get("enable-query-caching") &&
        PLUGIN_CACHING.cacheTTLFormField
      ) {
        fields.push({
          ...PLUGIN_CACHING.cacheTTLFormField,
          type: "dashboardCacheTTL",
          message: t`Cache all question results for`,
        });
      }
      return fields;
    },
  },
};
