import { t } from "ttag";
import MetabaseSettings from "metabase/lib/settings";
import { PLUGIN_CACHING } from "metabase/plugins";

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
  dataAppPage: {
    fields: () => [
      {
        ...createNameField(),
        placeholder: t`What is the name of your page?`,
      },
      createDescriptionField(),
      {
        ...createCollectionIdField(),
        type: "hidden",
      },
      {
        name: "is_app_page",
        type: "hidden",
        initial: true,
        normalize: () => true,
      },
    ],
  },
};
